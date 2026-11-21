import { Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { graphicsNow } from '../graphics';
import { nyeAsked, nyeOff, nyeSeconds, NYE_TIMES, squareShown } from '../nye/clock';
import { LAKE_AVENUE, LAKE_GATE, LAKE_MANDALA, LAKE_PILLARS, LAKE_SALAS, LAKE_SHORE, LAKE_SHOW, LAKE_SIDE, LAKE_STAGE, LAKE_STALLS, LAKE_WALL, lakePlazaAt, lakePlazaPolar, onLakeShore } from '../nye/plan';
import { SPARK_MAX, SPARKS, sparksOut } from '../nye/_lifeSparks';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { gatherPlaces, GROUP, moreSparklers, moveTo, pickCouples, planRunners, RUN, runnerAt, spreadGroups, VONG, vongAt, vongLook, type GroupPlan, type Runner, type Venue } from './_nyeGroups';
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
  STAGE_FRONT,
  stoolDef,
  toStage,
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
 * (grandmother, mother, children; the grandfather on a low stool behind), young couples sitting side by side on the
 * ghat's top step by the water, the standing families in small groups over the landing and the terrace, chatting
 * (`_nyeGroups.ts` `spreadGroups`: denser toward the stage; some round the dance, watching it), the jetty and the pale
 * way up the middle kept open; children with sparklers (their sparks: nye/_life.ts, from `SPARKS`), children running
 * between the groups two by two, phones up. From 22:42 couples from the crowd dance the roam vong slowly round the
 * terrace's medallion (`POSE.vong`), and go back to their families at 23:58:40; the mahori plays on for them. Five boats of families paddle up from the village and moor on the open water beyond the stage's village
 * end, a paper lantern glowing at each bow. From 22:58 two of the mats' children go down the ghat to the second step
 * in the water, kneel and set lotus candles afloat in turn (a few of their own drift off along the shore, among the
 * venue's: nye/_lkWater.ts), squatting to watch them go. On the floating stage (22:30‥23:50) a mahori ensemble (roneat
 * ek, khim, tro) plays at its north-west end and two dancers circle in the romvong; at 23:50 they bow and step aside. The
 * last four minutes the groups draw a little nearer the stage, and in the last two everyone turns to the board; the
 * last ten seconds: phones up, arms counting; midnight: cheering,
 * jumping, two of a family stepping together to hug, the boats' children standing up; the fireworks over the lake behind the stage (heads up);
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
/**
 * The board's face on the deck (v) and its middle's height over the deck (nye/_lkStage.ts: the gate's front at v −1.5,
 * the board 1.05‥6.05 m over the deck; the braziers before it at u ±4.3, v −0.35, where nobody stands: the performers
 * keep to v ≥ 1 in front of them).
 */
const BOARD_V = -1.6;
const BOARD_Y = 3.55;
/** Lotus candles kept afloat at once (a ring of rigs). */
const CANDLES = 8;

/** The ordinary days' hours (`clock`): the evening's stroll, the mender by day. */
const STROLL = (c: number) => c >= 0.08 && c < 0.3;
/** The stalls' sellers' hours (as the Kulen square's). */
const OPEN = (c: number) => c >= 0.8 || c < 0.4;
const MENDING = (c: number) => c >= 0.76 || c < 0.12;

const EX_AT: Point = { x: 0, y: 0, z: 0 };
const P = { x: 0, z: 0, yaw: 0 };
const UV = { x: 0, z: 0 };
const V = new Vector3();
/**
 * The roam vong (`_nyeGroups.ts`) round the plaza's gold mandala (plan.ts `LAKE_MANDALA`: 2 m outside its gold rim, as
 * at Kulen), its times as the Kulen square's (22:42 until 23:58:40), couples at most (on low: their families' only).
 */
const VONG_RING = { x: LAKE_MANDALA.x, z: LAKE_MANDALA.z, r: LAKE_MANDALA.r + 2 } as const;
const VONG_FROM = -4700;
const VONG_TO = -80;
const VONG_COUPLES = 12;
/**
 * The night's crowd on the plaza: at most `CROWD` (the plan's first `CROWD_LOW` people are its families on low: the
 * rest stay home there), leaving room in the crowd for the other players' (`_scenePlayers.ts`: 50) and a margin.
 */
const CROWD = 122;
const CROWD_LOW = 78;
const PLAYERS_ROOM = 54;
/** Children running between the groups, until a minute and a half before midnight. */
const RUNNERS = 8;
const RUN_TO = -90;
/** Everyone turns to the board from two minutes before midnight; midnight's hug (s). */
const TURN_FROM = -120;
/** The groups gather toward the stage for the countdown (`_nyeGroups.ts` `gatherPlaces`), each setting off in these 100 s. */
const GATHER_FROM = -250;
const GATHER_PULL = 0.12;
const HUG_FROM = 1.5;
const HUG_TO = 8.5;
/** Young couples sitting side by side on the ghat's top step, by the water (stage frame u of each), more sparklers. */
const BY_WATER: readonly number[] = [4, 6, -6];
const MORE_SPARKLERS = 10;
/**
 * The plaza's rules for a place to stand (plan.ts's layout; nye/_lkPlaza*.ts builds it): within `RIM` m of the ring
 * wall's line nobody stands (its fire pillars, the lamps), nor on the landing's open lane to the jetty (`LANE` m each
 * side), in the ways in from the gate and the side opening (`AISLE` m each side), at a stall (its stand and counter, the
 * buyers' spot before it: `STALL_BOX` in its frame, x across, z toward the plaza's middle) or a sala (its plinth and
 * steps, `SALA_STEPS` m out from its front); the ghat (`GHAT` m each side of the jetty).
 */
const RIM = 2.2;
const LANE = 2.3;
const AISLE = 1.5;
const GHAT = 8.5;
const STALL_BOX = { x: 2.2, z0: -1.7, z1: 3.0 } as const;
const SALA_STEPS = 1.8;
/** The sellers behind the stalls' counters: on the stool (stall frame, nye/_lkPlazaSala.ts), facing the plaza. */
const STOOL = { x: 0.65, z: -0.25 } as const;
/** The way in for the night's families: up the east shore trail, onto the avenue near its end, down it, through the gate. */
const TRAIL_IN: readonly [number, number][] = [
  [-290, 62],
  [-282, 46],
  [-278, 26],
  [-276, 0],
  [-282, -28],
  [-292, -60],
  [-296.3, -76],
];
/** The fireworks (heads up during the show): the lake show's middle, half way up it (`LAKE_SHOW` heights over the water). */
const SKY_MID = (LAKE_SHOW.low + LAKE_SHOW.high) / 2;
const VG = { x: 0, z: 0, yaw: 0, turn: 0 };
const T = { x: 0, z: 0 };
const Q = { x: 0, z: 0 };
const Q2 = { x: 0, z: 0 };
const LOOK: Point = { x: 0, y: 0, z: 0 };
const SKYP: Point = { x: 0, y: 0, z: 0 };
const HAND = { x: 0, y: 0, z: 0 };
const O = { x: 0, z: 0 };

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
  /** The groups, the roam vong's dancers (each member's place in the ring, high and low: −1 none), the runners (as the Kulen square's). */
  private readonly groups: GroupPlan;
  private readonly slotHigh: Int16Array;
  private readonly slotLow: Int16Array;
  private readonly dancersHigh: number;
  private readonly dancersLow: number;
  private readonly partnerOf: Int16Array;
  private readonly runners: Runner[];
  private readonly runnerOf: Int16Array;
  private readonly inRing: Uint8Array;
  private readonly away: Uint8Array;
  /** Per member: where they stand gathered toward the stage for the countdown. */
  private readonly gx: Float32Array;
  private readonly gz: Float32Array;
  private readonly sparklers: number[];
  private readonly byWater: number;
  /** The sellers behind the stalls' counters (on their stools), and where. */
  private readonly sellers: { a: Actor; x: number; z: number; yaw: number }[] = [];
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
    this.boardAt = { x: bd.x, y: this.deck + BOARD_Y, z: bd.z };
    this.sky = { x: LAKE_SHOW.x, y: WATER + SKY_MID, z: LAKE_SHOW.z };
    // The night's crowd (room left in the crowd, less the boats, the stage, the sellers and the ordinary days' people,
    // and the other players' room: up to `CROWD`); its families past the first `CROWD_LOW` people stay home on low.
    const room = crowd.capacity - crowd.count - 22 - LAKE_STALLS.length - PLAYERS_ROOM;
    this.plan = planLakeCrowd(this.site, Math.max(0, Math.min(CROWD, room)));
    {
      const ms = this.plan.members;
      const lowGroups = new Set(ms.slice(0, CROWD_LOW).map((m) => m.group));
      for (const m of ms) if (!lowGroups.has(m.group)) m.low = false;
    }
    // Made alive (_nyeGroups.ts): couples sitting by the water, the families spread in small groups, the roam vong's
    // couples, the runners, more sparklers.
    {
      const ms = this.plan.members;
      const site = this.site;
      this.byWater = this.sitByWater();
      const bankAt = (u: number) => site.bank[Math.max(0, Math.min(16, Math.round(u) + 8))];
      // (the lantern poles at the ghat's top corners: nye/_lkShore.ts puts each at the first of these that is dry)
      const poles = [-1, 1].flatMap((sgn) => [2.2, 3.4, 4.6].map((du) => stagePt(sgn * (GHAT + du), bankAt(sgn * (GHAT + du)) + 1.4, { x: 0, z: 0 })));
      const { mats, stools } = this.plan;
      const dry = (x: number, z: number) => {
        const w = field.waterAt(x, z);
        return !((w !== null && w > field.heightAt(x, z) - 0.05) || field.heightAt(x, z) < WATER + 1.2);
      };
      /** In a thing's frame (its middle, the way it faces): x across, z ahead. */
      const local = (x: number, z: number, t: { x: number; z: number; facing: number }) => {
        const dx = x - t.x;
        const dz = z - t.z;
        const c = Math.cos(t.facing);
        const sn = Math.sin(t.facing);
        O.x = dx * c - dz * sn;
        O.z = dx * sn + dz * c;
        return O;
      };
      /** Off the line from (phi, r0) on the rim in to the mandala: an aisle kept open. */
      const inAisle = (phi: number, r: number, along: number, half: number) => {
        if (r < VONG_RING.r) return false;
        const d = Math.abs(Math.sin(phi - along)) * r;
        return Math.cos(phi - along) > 0 && d < half;
      };
      /** Clear of everything built on the plaza and the landing (the stalls, the salas, the pillars, the poles, the mats). */
      const clearOf = (x: number, z: number, pad: number) => {
        for (const st of LAKE_STALLS) {
          const o = local(x, z, st);
          if (Math.abs(o.x) < STALL_BOX.x + pad && o.z > STALL_BOX.z0 - pad && o.z < STALL_BOX.z1 + pad) return false;
        }
        for (const sa of LAKE_SALAS) {
          const o = local(x, z, sa);
          if (Math.abs(o.x) < sa.w / 2 + 0.6 + pad && o.z > -sa.d / 2 - pad && o.z < sa.d / 2 + SALA_STEPS + pad) return false;
        }
        for (const p of LAKE_PILLARS) if (Math.hypot(p.x - x, p.z - z) < (p.big ? 2.0 : 1.6) + pad) return false;
        for (const p of poles) if (Math.hypot(p.x - x, p.z - z) < 1.6 + pad) return false;
        for (const m of mats) if (Math.hypot(m.x - x, m.z - z) < 2.2 + pad) return false;
        for (const st of stools) if (Math.hypot(st.x - x, st.z - z) < 1.2 + pad) return false;
        return true;
      };
      const venue: Venue = {
        ok: (x, z) => {
          if (!dry(x, z) || !site.paved(x, z)) return false;
          const [phi, r] = lakePlazaPolar(x, z);
          toStage(x, z, O);
          // (on the plaza, the wall's line kept clear, or on the landing above the bank; out of the landing's open lane)
          const onLanding = r > LAKE_WALL.r - RIM && Math.abs(O.x) <= GHAT - 0.5 && O.z >= bankAt(O.x) + 1;
          if (r > LAKE_WALL.r - RIM && !onLanding) return false;
          if (O.z > STAGE_FRONT && Math.abs(O.x) < LANE && Math.cos(phi) > 0.5) return false;
          // (the mandala and the dance round it open; the ways in from the gate and the side opening to it)
          if (r < VONG_RING.r + 1.6) return false;
          if (inAisle(phi, r, LAKE_GATE.phi, AISLE) || inAisle(phi, r, LAKE_SIDE.phi, AISLE)) return false;
          return clearOf(x, z, 0.2);
        },
        box: [LAKE_SHORE.x - LAKE_WALL.r - 12, LAKE_SHORE.z - LAKE_WALL.r - 12, LAKE_SHORE.x + LAKE_WALL.r + 12, LAKE_SHORE.z + LAKE_WALL.r + 12],
        board: (x, z) => Math.atan2(LAKE_STAGE.x + Math.sin(LAKE_STAGE.yaw) * STAGE_FRONT - x, LAKE_STAGE.z + Math.cos(LAKE_STAGE.yaw) * STAGE_FRONT - z),
        front: { ...stagePt(0, bankAt(0) + 3, { x: 0, z: 0 }), reach: 34 },
        ring: VONG_RING,
        // (a group before each stall, turned to it, and before each sala's steps)
        stalls: [...LAKE_STALLS.map((st) => ({ ...st, out: STALL_BOX.z1 + 0.6 })), ...LAKE_SALAS.map((sa) => ({ ...sa, out: sa.d / 2 + SALA_STEPS + 0.8 }))],
        stallOut: 3.6,
        // (children run across the lane and the aisles too: anywhere on the plaza, clear of what is built)
        open: (x, z) => dry(x, z) && onLakeShore(x, z, -1.6) && clearOf(x, z, 0),
        seed: 0x1a4e + 5,
      };
      this.groups = spreadGroups(ms, venue);
      ({ gx: this.gx, gz: this.gz } = gatherPlaces(ms, this.groups, venue, GATHER_PULL));
      const couples = pickCouples(ms, VONG_COUPLES, () => true, 0x1a4e + 6, (k) => ms[k].low);
      this.slotHigh = new Int16Array(ms.length).fill(-1);
      this.slotLow = new Int16Array(ms.length).fill(-1);
      this.partnerOf = new Int16Array(ms.length).fill(-1);
      let hi = 0;
      let lo = 0;
      for (const [a, b] of couples) {
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
      moreSparklers(ms, MORE_SPARKLERS, (k) => this.slotHigh[k] < 0, 0x1a4e + 7);
      this.sparklers = ms.map((m, k) => (m.sparkler ? k : -1)).filter((k) => k >= 0).slice(0, SPARK_MAX);
      this.inRing = new Uint8Array(ms.length);
      this.away = new Uint8Array(ms.length);
      // Their way in: up the east shore trail, down the avenue, through the gate, round the dance to their place.
      for (const m of ms) this.routeIn(m);
    }
    for (const m of this.plan.members) this.crowdActors.push(mk(m.look));
    // The sellers behind the stalls' counters, on their stools (each stall's kind: nye/_lkPlazaSala.ts `KINDS`).
    LAKE_STALLS.forEach((st, k) => {
      const goods = (['fish', 'fruit', 'fruit', 'sweets'] as const)[k % 4];
      const a = mk(dress('vendor', 9740 + k, { hat: k % 2 ? 'krama' : 'none', goods, sex: k === 0 ? 'm' : 'f' }));
      const c = Math.cos(st.facing);
      const sn = Math.sin(st.facing);
      this.sellers.push({ a, x: st.x + STOOL.x * c + STOOL.z * sn, z: st.z - STOOL.x * sn + STOOL.z * c, yaw: st.facing });
    });
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
      `[map] nye lake people: ${ms.length} on the terrace (${n((m) => m.low)} on low; ${this.plan.groups.length} families, ${this.plan.mats.length} mats, ${n((m) => m.role === 'sit' || m.role === 'lotus')} seated, ${n((m) => m.role === 'stool')} on stools, ${n((m) => m.kid)} children, ${n((m) => m.sparkler)} sparklers, ${n((m) => m.phone)} phones, ${n((m) => m.role === 'lotus')} with lotus candles, ${this.byWater} couples by the water; groups ${this.groups.count[0]} out on the terrace, ${this.groups.count[2]} round the dance; roam vong ${this.dancersHigh} (${this.dancersLow} on low), ${this.runners.length} running), ${this.plan.boats.length} boats with ${crew} (${crewLow} on low), ${this.plan.candles.length} candles, ${this.actors.length} in all`,
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
    // The sellers (also through the night) and the ordinary days.
    const open = night ? s < LAKE_GONE + 120 : OPEN(c);
    for (const sl of this.sellers) this.seller(sl, open, night, now, dt, ex);
    this.stroll(!night && STROLL(c), now, dt, ex);
    this.mend(!night && MENDING(c), now, dt, ex);
    // The night.
    const ms = this.plan.members;
    for (let k = 0; k < ms.length; k++) this.member(k, night && (!low || ms[k].low), s, now, dt, ex, low);
    for (const b of this.boats) this.boat(b, night && (!low || b.b.low), s, now, dt, f);
    this.floatCandles(night, s, now);
    this.stage(night, s, now, dt, f);
    this.sparks(night);
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

  /**
   * A member's way in (into their `route`, `cum`, `trail`): from the floating village up the east shore trail, onto
   * the avenue near its end, down it and through the land gate (`LAKE_GATE`, single file from there: `trail`), round
   * the dance's ring when their place is across the plaza, to their place.
   */
  private routeIn(m: LakeMember): void {
    const pts: number[] = [];
    for (const [x, z] of TRAIL_IN) pts.push(x, z);
    const ph = LAKE_AVENUE.phi;
    for (const r of [LAKE_AVENUE.r1 - 1, (LAKE_AVENUE.r1 + LAKE_AVENUE.r0) / 2, LAKE_AVENUE.r0 + 0.4]) pts.push(...lakePlazaAt(ph, r));
    const trail = pts.length / 2;
    pts.push(...lakePlazaAt(ph, LAKE_WALL.r), ...lakePlazaAt(ph, LAKE_WALL.r - 2.4));
    // (across the plaza: two points round the ring's outside, the shorter way)
    const [pp, pr] = lakePlazaPolar(m.x, m.z);
    let d = pp - ph;
    d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
    if (Math.abs(d) > 0.9) for (const k of [0.33, 0.67]) pts.push(...lakePlazaAt(ph + d * k, Math.max(VONG_RING.r + 4.5, Math.min(17, pr))));
    pts.push(m.x, m.z);
    const route = new Float32Array(pts);
    const cum = new Float32Array(route.length / 2);
    for (let k = 1; k < cum.length; k++) cum[k] = cum[k - 1] + Math.hypot(route[2 * k] - route[2 * k - 2], route[2 * k + 1] - route[2 * k - 1]);
    m.route = route;
    m.cum = cum;
    m.trail = cum[trail - 1];
  }

  /** A seller on the stool behind a stall's counter: busy handing things over on the night, now and then by day. */
  private seller(sl: { a: Actor; x: number; z: number; yaw: number }, open: boolean, night: boolean, now: number, dt: number, ex: Obstacle | null): void {
    const a = sl.a;
    if (!open) return void (a.shown && a.hide());
    this.put(a, sl.x, sl.z, sl.yaw, 2);
    a.goTo(sl.x, sl.z, 0.4);
    a.face(sl.yaw);
    const h = hash3(Math.floor((now + a.i * 3.1) / (night ? 5 : 9)), a.i, 13, 2027);
    a.pose(h < (night ? 0.35 : 0.15) ? POSE.give : POSE.stool, now);
    a.carry(0, now);
    a.tilt(0);
    this.glance(a, ex, now);
    a.step(dt, now);
  }

  /** Where member `i` looks in the show: round the lake show's middle, half way up it, each a little apart (into `SKYP`). */
  private skyOf(i: number): Point {
    SKYP.x = LAKE_SHOW.x + (hash3(i, 1, 8, 2027) - 0.5) * LAKE_SHOW.spread * 0.8;
    SKYP.y = WATER + SKY_MID + (hash3(i, 2, 8, 2027) - 0.5) * (LAKE_SHOW.high - LAKE_SHOW.low) * 0.45;
    SKYP.z = LAKE_SHOW.z + (hash3(i, 3, 8, 2027) - 0.5) * LAKE_SHOW.depth * 0.6;
    return SKYP;
  }

  /** Young couples (families of two grown-ups, partners) sitting side by side on the ghat's top step, facing the lake. */
  private sitByWater(): number {
    const ms = this.plan.members;
    const site = this.site;
    const size = (g: number) => ms.reduce((c, q) => c + (q.group === g ? 1 : 0), 0);
    const used = new Set<number>();
    let n = 0;
    for (const u of BY_WATER) {
      const k = ms.findIndex((m, i) => !used.has(i) && m.role === 'stand' && !m.kid && m.partner > i && ms[m.partner].role === 'stand' && !ms[m.partner].kid && size(m.group) === 2);
      if (k < 0) break;
      const p = ms[k].partner;
      // (the top step of one strip of the ghat, half a run down from its bank's edge: the two side by side on it)
      const v = site.bank[Math.max(0, Math.min(16, Math.round(u) + 8))] - 0.25;
      if (![-0.32, 0.38].every((du) => Number.isFinite(site.stepTop(u + du, v)))) continue;
      [k, p].forEach((i, j) => {
        stagePt(u + (j ? 0.38 : -0.32), v, UV);
        moveTo(ms[i], UV.x, UV.z, LAKE_STAGE.yaw + Math.PI);
        ms[i].role = 'sit';
        used.add(i);
      });
      n++;
    }
    return n;
  }

  /** One of the terrace's crowd: on the way, in their place (a lotus child down at the water's edge; dancing, running about), on the way home. */
  private member(k: number, on: boolean, s: number, now: number, dt: number, ex: Obstacle | null, low: boolean): void {
    const m = this.plan.members[k];
    const a = this.crowdActors[k];
    const g = this.plan.groups[m.group];
    const L = m.cum[m.cum.length - 1];
    const goneD = (s - g.leave) * g.v - m.lag;
    const comeD = (s - g.start) * g.v - m.lag;
    if (!on || comeD < 0 || goneD >= L) {
      this.inRing[k] = this.away[k] = 0;
      return void (a.shown && a.hide());
    }
    if (comeD < L || goneD > 0) {
      const home = goneD > 0;
      const d = home ? L - goneD : comeD;
      alongLake(m, d, P);
      const behind = a.shown ? a.dist(P.x, P.z) : 0;
      this.put(a, P.x, P.z, home ? P.yaw + Math.PI : P.yaw, home ? 40 : 8);
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
    // The roam vong round the medallion.
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
      a.tilt(0);
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

  /** A dancer of the roam vong (as the Kulen square's): to their place in the ring, then slowly round it, the hands dancing. */
  private vong(k: number, j: number, n: number, s: number, now: number, dt: number): void {
    const a = this.crowdActors[k];
    vongAt(j, n, s, VONG_RING, 0.6, VG);
    this.away[k] = 1;
    if (!this.inRing[k] && a.shown && a.dist(VG.x, VG.z) > 0.7) {
      a.riding = false;
      a.goTo(VG.x, VG.z, 1.25);
      a.face(null);
      a.pose(POSE.stand, now);
      a.carry(0, now);
      a.lookAt(null);
      a.tilt(0);
      a.step(dt, now);
      return;
    }
    this.inRing[k] = 1;
    a.ride(VG.x, this.groundAt(VG.x, VG.z), VG.z, VG.yaw);
    a.show();
    a.pose(POSE.vong, now);
    a.carry(0, now);
    a.tilt(0);
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

  /** A child running round its loop between the groups (as the Kulen square's). */
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
    a.tilt(0);
    a.step(dt, now);
  }

  /** The sparklers' tips for the night's life (nye/_life.ts): lit while held up. */
  private sparks(night: boolean): void {
    const out = SPARKS.lake;
    for (let j = 0; j < out.length; j++) {
      const k = this.sparklers[j];
      const v = out[j];
      const a = k === undefined ? null : this.crowdActors[k];
      if (!night || !a?.shown || a.riding) {
        v.w = 0;
        continue;
      }
      const c = a.crowd;
      const sc = c.scale(a.i);
      c.handAt(a.i, HAND);
      const up = (HAND.y - a.y) / sc;
      v.set(HAND.x, HAND.y + 0.84 * sc, HAND.z, Math.min(1, Math.max(0, (up - 0.66) / 0.16)));
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

  /**
   * What someone in their place does now (as the Kulen square's: chatting in the group, watching the dance or the
   * stage, phones; turned to the board for the countdown; the cheer and midnight's hug; the show; after).
   */
  private mood(k: number, m: LakeMember, a: Actor, s: number, now: number): Pose {
    const seated = m.role !== 'stand';
    const sitPose = m.role === 'stool' ? POSE.stool : POSE.sit;
    const G = this.groups;
    const w = Math.floor((s + a.i * 2.9) / 7);
    const h = hash3(w, a.i, 6, 2027);
    // (turned to the board from where they stand: their place, or gathered toward the stage)
    let yaw = Math.atan2(this.boardAt.x - T.x, this.boardAt.z - T.z);
    let look: Point | null = this.boardAt;
    let pose: Pose = seated ? sitPose : POSE.stand;
    let hold = 0;
    const turned = s >= TURN_FROM + 30 * hash3(a.i, 3, 6, 2027) || this.gathered(m.group, s);
    if (s < -10 && !turned) {
      look = s < DANCE_TO ? this.stageLook : this.boardAt;
      const chat = G.chat[k];
      if (!seated && !Number.isNaN(chat)) {
        const gw = hash3(Math.floor((s + m.group * 13.7) / 24), m.group, 10, 2027);
        const kind = G.kind[k];
        const vongOn = s >= VONG_FROM && s < VONG_TO;
        if (vongOn && ((kind === GROUP.ring && gw < 0.8) || (kind === GROUP.open && gw > 0.84))) {
          const dx = m.x - VONG_RING.x;
          const dz = m.z - VONG_RING.z;
          const d = Math.hypot(dx, dz) || 1;
          yaw = Math.atan2(-dx, -dz);
          LOOK.x = VONG_RING.x + (dx / d) * VONG_RING.r;
          LOOK.y = a.y + 2;
          LOOK.z = VONG_RING.z + (dz / d) * VONG_RING.r;
          look = LOOK;
        } else if (kind === GROUP.open && s < DANCE_TO && gw > 0.64) look = this.stageLook;
        else {
          yaw = chat;
          look = null;
          if (!m.kid && h > 0.5) pose = POSE.talk;
        }
      }
      if (!seated) {
        if (m.phone && h < 0.22) pose = POSE.photo;
        else if (m.phone && h < 0.32) hold = 1;
        else if (m.kid && h > 0.86) pose = POSE.wave;
      } else if (m.phone && h < 0.2) hold = 1;
      if (hold) look = null;
      if (m.sparkler && s > -1500) hold = 1;
    } else if (s < 0) {
      if (!seated) pose = s < -10 ? (m.phone && h < 0.4 ? POSE.photo : POSE.stand) : m.phone ? POSE.photo : s > -3 && h < 0.6 ? POSE.cheer : POSE.point;
      if (m.sparkler) hold = 1;
    } else if (s < 30) {
      if (h < 0.45) look = this.skyOf(a.i);
      const o = m.partner >= 0 ? this.plan.members[m.partner] : null;
      if (m.role === 'stool') pose = POSE.stool;
      else if (seated) pose = m.kid ? POSE.cheer : h < 0.5 ? POSE.wave : POSE.sit;
      else if (o && o.role === 'stand' && s > HUG_FROM && s < HUG_TO && Math.hypot(this.place(m.partner, s, Q2).x - T.x, Q2.z - T.z) < 2.6) {
        const p = this.crowdActors[m.partner];
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
      look = this.skyOf(a.i);
      yaw = Math.atan2(this.sky.x - m.x, this.sky.z - m.z) * 0.5 + m.yaw * 0.5;
      if (!seated) pose = m.phone && h < 0.5 ? POSE.photo : h > 0.93 ? POSE.cheer : h > 0.88 ? POSE.point : POSE.look;
      if (m.sparkler) hold = 1;
    } else if (!seated) {
      const chat = G.chat[k];
      if (!Number.isNaN(chat) && h < 0.5) {
        yaw = chat;
        look = null;
      }
      pose = h < 0.35 ? POSE.talk : m.phone && h < 0.5 ? POSE.photo : h > 0.92 ? POSE.wave : POSE.stand;
    }
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
    // (the mahori plays on for the roam vong round the medallion after the dancers' bow)
    const playing = on && s >= DANCE_FROM && s < VONG_TO;
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
      a.performing = playing;
      a.tilt(playing ? 0.25 + 0.12 * Math.cos(now * 2.6 + k) : 0);
      a.lookAt(s >= 30 && s < NYE_TIMES.show ? this.sky : s < DANCE_TO ? null : this.boardAt, now + 1);
    }
    // (a phrase of music every few seconds while they play, from the ensemble's mat)
    if (playing && f.dt > 0 && now - this.phraseAt > 7.1) {
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
    sparksOut('lake');
    this.inRing.fill(0);
    this.away.fill(0);
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
