import { Vector3 } from 'three';
import { SURFACE, type HeightField } from '../heightfield';
import { WIND } from '../sky/haze';
import type { MapFrame, Subject } from '../types';
import { canopyOf } from '../veg/canopy';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { Kite, type KiteLook, type KiteWind } from './_kite';
import { CARRY, FEAT, POSE, type Look, type Pose } from './_personModel';
import { len, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * Kite flyers (khleng, ខ្លែង), the Khmer way (the kites themselves: `_kite.ts`).
 *
 * What the kites are and how Cambodians fly them (sources in
 * docs/map-work/BRIEF.md, "People"): the **khleng ek** (ខ្លែងឯក) is the
 * big kite of the dry season, 1.5‥4 m, shaped like a bird of prey seen from
 * below, with its **ek** — a bamboo bow strung with a paper-thin ribbon of
 * rattan — humming on its beak, and two long tails of palm leaf. It is
 * flown after the rains, from the Water Festival to March, in the steady
 * north wind (the windiest weeks are December and January, when the rice is
 * cut): over the rice fields, at dawn and into the night, and after a
 * flight it is tied to a stake and left humming over the fields all night
 * (it was said to keep animals off the crops) while the village listens and
 * judges its voice. It is too big and strong for a child: grown men and old
 * men fly it, three to five to a kite, with their families round them.
 * Children fly small kites of their own: the **khleng kandaung**
 * (ខ្លែងកណ្ដូង), a tail-less "pocket kite" they fight and dart about, and
 * small khleng ek.
 *
 * Two fields:
 *
 * - **The children** on the open grass south of the west paddies, by the
 *   lake, any time of the year but in rain, from late morning (`clock`
 *   0.86) to dusk (0.2), home before dark: two with khleng kandaung (magenta,
 *   green), the eldest with a small khleng ek that hums high; a small one
 *   runs from one to the next. Laughter now and then (`laugh`).
 * - **The families** on the open grass south of the east paddies
 *   (x 405‥430, z 78‥106; the sugar-palm village is north of them), in the
 *   kite season (`season` ≈ 0.6‥0.97: after the Water Festival, through the
 *   harvest, to the end of March; each kite its own weeks) from the early
 *   afternoon (0.93) into the night (≈ 0.3): three big khleng ek — the
 *   grandfather's (a male kite, pointed wings, the deepest voice; his son
 *   and a grandchild with him), a family's (a female kite, round wings, a
 *   high voice; the father on the line, the mother and a daughter on a
 *   woven mat) and two young men's (brought in at dusk). They come round
 *   the paddies from the village (`EAST_GATE`; not with less than
 *   `COME_LEFT` of their hours left), launch, fly; at nightfall the grandfather
 *   and the father tie their lines to bamboo stakes and walk home, and the
 *   two kites hum over the empty fields all night, until the families come
 *   back and take their lines again the next afternoon.
 *
 * The kites fly downwind (`f.weather.windDir`, followed slowly) at a line
 * angle and a bob that grow with the wind at kite height (a steady breeze
 * aloft over `f.weather.wind`); rain, a storm or snow brings them in and
 * sends everyone home. Every flying khleng ek hums: a `kiteHum` call (a
 * phrase) every few seconds while the listener is within `HUM_REACH`, with
 * its `gain` from the wind and its size, and the `size` its bow sings for
 * (the sound's note, audio/kite.ts: deep for a big male kite, high for a
 * small or a female one), so several make a chorus. Close by, the
 * grandfather asks the explorer if he hears the ek (`ktHear`), the eldest
 * child boasts (`ktHighest`).
 *
 * Cost: 12 people, 204 thing boxes (a khleng ek 44 with its line and
 * tails, a kandaung 12, the mat, two stakes), < 0.1 ms a frame. Far off the
 * people step less often and hide past 480 m, the kites past 900 m
 * (`Pace`). URL: `people=kites` (only these), `season=0.9` (the east field
 * in the kite season), `clock=0.25|0.4` (dusk, the tethered kites at night).
 */

// ── The children, west ──
/** Where the children stand, and the small one's start. */
const WEST: [number, number][] = [
  [-250, 112.5],
  [-238.5, 113.5],
  [-226, 112],
];
const RUNNER: [number, number] = [-240, 111];
/** Out between these clocks (late morning to dusk), and home before it is this dark (`night`). */
const WEST_FROM = 0.86;
const WEST_TO = 0.2;
const WEST_DARK = 0.45;
const WEST_KITES: KiteLook[] = [
  { kind: 'kandaung', sail: 0xd8407a, edge: 0xd8407a, motif: 0xf2d24a, size: 1.1, line: 30, lineColor: 0xf2eee4 },
  { kind: 'ek', tips: 'round', sail: 0xf4f0e2, edge: 0xd83a2a, motif: 0x2a5aa8, motif2: 0xd83a2a, tail: 0xe0503a, size: 1.5, line: 40, tails: 5, lineColor: 0xf2eee4 },
  { kind: 'kandaung', sail: 0x3a9a4a, edge: 0x3a9a4a, motif: 0xf4f0e2, size: 1.0, line: 34, lineColor: 0xf2eee4 },
];

// ── The families, east ──
/** Where they come from and go home (the paddies' south-east corner, from the village by the palm lane and the dikes). */
const EAST_GATE: [number, number] = [404, 73];
/** The kite season (`season`: after the Water Festival, through the harvest, to the end of March). */
interface EastPlan {
  id: string;
  spot: [number, number];
  look: KiteLook;
  /** Its weeks in the season, and its hours (`clock`: out from, home at). */
  season: [number, number];
  from: number;
  to: number;
  /** Tied to a stake for the night (else brought in at dusk). */
  tether: boolean;
  /** A female kite (round wings) sings high: its voice is that of a smaller bow. */
}
const EAST: EastPlan[] = [
  {
    id: 'grandfather',
    spot: [425, 80],
    look: { kind: 'ek', tips: 'pointed', sail: 0xeee2c4, edge: 0xa8322a, motif: 0xa8322a, motif2: 0x2a3a6a, tail: 0xd8c890, size: 3.4, line: 78, tails: 14, lineColor: 0xd8ccb0 },
    season: [0.6, 0.97],
    from: 0.93,
    to: 0.3,
    tether: true,
  },
  {
    id: 'family',
    spot: [420, 91],
    look: { kind: 'ek', tips: 'round', sail: 0xf4f2ea, edge: 0x1f3f9a, motif: 0xd02030, motif2: 0x1f3f9a, tail: 0xd8c890, size: 3.0, line: 68, tails: 12, lineColor: 0xd8ccb0 },
    season: [0.63, 0.95],
    from: 0.94,
    to: 0.31,
    tether: true,
  },
  {
    id: 'young men',
    spot: [415, 102],
    look: { kind: 'ek', tips: 'pointed', sail: 0xe8b43a, edge: 0x8a2a24, motif: 0x2a2426, motif2: 0x8a2a24, tail: 0xd8c890, size: 2.8, line: 60, tails: 11, lineColor: 0xd8ccb0 },
    season: [0.67, 0.92],
    from: 0.95,
    to: 0.27,
    tether: false,
  },
];

/** People are drawn this far (m); kites, high and big, much farther. */
const PEOPLE_FAR = 480;
const KITES_FAR = 900;
/** Seconds to let a kite out to its full line, and to bring it in. */
const LAUNCH = 30;
const LAND = 18;
/** Walking pace (m/s); the small ones run. */
const WALK = 0.9;
const RUN = 2.2;
/** The families set out only with this much of their hours left (`clock`). */
const COME_LEFT = 0.05;
/** Seconds bent over the stake, tying the line or untying it. */
const TIE = 2.5;
/** The hum is sent while the listener is this near a kite (m). */
const HUM_REACH = 240;
/** Seconds between words to the explorer (and how near he must be, m). */
const SAY_EVERY = 90;
const SAY_NEAR = 5;

type Job = 'line' | 'watch' | 'sit' | 'run';

interface Member {
  a: Actor;
  job: Job;
  /** Their place while the group is out (m). */
  x: number;
  z: number;
  /** Holding the reel, and empty-handed (walking, tying up): only line holders change. */
  held: Look;
  bare: Look;
  seed: number;
  /** The kite whose line they hold (null: none). */
  line: Line | null;
}

interface Line {
  kite: Kite;
  holder: Member;
  /** The size its ek sings for (m, `AnimalCall.size`: the sound's note falls with it): its own, or less for a female kite's high voice. */
  voice: number;
  humAt: number;
}

type State = 'home' | 'coming' | 'flying' | 'tying' | 'landing' | 'going';

interface Group {
  id: string;
  west: boolean;
  lines: Line[];
  members: Member[];
  /** The middle of the group (m: its pace goes by it). */
  cx: number;
  cz: number;
  /** Tied up here for the night (the stake's slot, where it stands). */
  stake: Point | null;
  stakeSlot: number;
  /** The mat's slots (the mat, its woven band), where it lies and its heading; −1: none. */
  mat: number;
  matAt: Point;
  matYaw: number;
  season: [number, number];
  from: number;
  to: number;
  gate: Point | null;
  state: State;
  /** Where the kite is: down (hidden), in the hands, tied to the stake; how far out (0‥1). */
  kiteAt: 'down' | 'held' | 'tied';
  out: number;
  /** When the holder began bending over the stake (−1: not yet). */
  bendAt: number;
  pace: Pace;
  /** People drawn (near enough); the kites drawn once at least. */
  seen: boolean;
  drawn: boolean;
  sayAt: number;
  laughAt: number;
}

const H = new Vector3();
const EX: Point = { x: 0, y: 0, z: 0 };

export class KiteFlyers implements PeopleScene {
  readonly name = 'kites';
  readonly actors: Actor[] = [];
  private readonly groups: Group[] = [];
  private readonly wind: KiteWind = { x: WIND.x, z: WIND.z, k: 0.6 };
  private windDir = Number.NaN;
  /** Daylight through the kites' paper (1 day … 0 night: `Kite.light`). */
  private day = 1;
  private logged = false;
  /** Whom each runner runs to (in turn). */
  private readonly runTo = new Map<Member, Member[]>();

  constructor(private readonly env: PeopleEnv) {
    const field = env.ground.field;
    const things = env.things;
    const t0 = performance.now();
    const boxes0 = things.used;
    // The children, west.
    const kids: Member[] = [];
    const west: Line[] = WEST.map(([x0, z0], k) => {
      const p = clearSpot(field, x0, z0);
      const held = dress('kid', 901 + k * 2, { carry: CARRY.kite });
      const m = this.member(held, 'line', p.x, p.z, k * 0.31);
      kids.push(m);
      return (m.line = { kite: new Kite(things, WEST_KITES[k], 0.17 + k * 0.29), holder: m, voice: voiceOf(WEST_KITES[k]), humAt: 3 + k });
    });
    const runner = this.member(dress('kid', 907, { young: true }), 'run', RUNNER[0], RUNNER[1], 0.5);
    this.groups.push(this.group('children', true, west, [...kids, runner], null, -1, [0, 1], WEST_FROM, WEST_TO, null));
    // The families, east.
    const across = { x: -WIND.z, z: WIND.x };
    for (const [n, plan] of EAST.entries()) {
      const p = clearSpot(field, plan.spot[0], plan.spot[1]);
      const at = (side: number, back: number): [number, number] => [p.x + across.x * side - WIND.x * back, p.z + across.z * side - WIND.z * back];
      const members: Member[] = [];
      const holder = this.member(
        dress('villager', 951 + n * 10, n === 0 ? { sex: 'm', age: 'old', hat: 'krama', carry: CARRY.kite } : { sex: 'm', age: 'young', hat: n === 1 ? 'none' : 'palm', carry: CARRY.kite }),
        'line',
        p.x,
        p.z,
        0.2 + n * 0.3,
      );
      members.push(holder);
      let mat = -1;
      let matAt: Point = { x: 0, y: 0, z: 0 };
      if (n === 0) {
        // The grandfather's son beside him; a grandchild running between the two families.
        members.push(this.member(dress('villager', 953, { sex: 'm', hat: 'palm' }), 'watch', ...at(2.2, 0.8), 0.6));
        members.push(this.member(dress('kid', 955, { young: true }), 'run', ...at(-2, 2), 0.1));
      } else if (n === 1) {
        // The mother and a daughter on a woven mat behind the father.
        const [mx, mz] = at(0, 3.4);
        matAt = { x: mx, y: field.heightAt(mx, mz), z: mz };
        mat = things.alloc(2);
        things.paint(mat, 0xcfb277);
        things.paint(mat + 1, 0xa83a2a);
        members.push(this.member(dress('villager', 963, { sex: 'f', hat: 'krama' }), 'sit', mx + across.x * 0.5, mz + across.z * 0.5, 0.35));
        members.push(this.member(dress('kid', 965), 'sit', mx - across.x * 0.5, mz - across.z * 0.5, 0.8));
      } else {
        members.push(this.member(dress('villager', 973, { sex: 'm', age: 'young', hat: 'krama' }), 'watch', ...at(-2.4, 1), 0.45));
      }
      let stake: Point | null = null;
      let stakeSlot = -1;
      if (plan.tether) {
        const [sx, sz] = at(-1.7, 0.4);
        stake = { x: sx, y: field.heightAt(sx, sz), z: sz };
        stakeSlot = things.alloc(1);
        things.paint(stakeSlot, 0x9a7a48);
      }
      const line: Line = { kite: new Kite(things, plan.look, 0.4 + n * 0.23), holder, voice: voiceOf(plan.look), humAt: 2 + n * 1.3 };
      holder.line = line;
      const g = this.group(plan.id, false, [line], members, stake, stakeSlot, plan.season, plan.from, plan.to, { x: EAST_GATE[0], y: field.heightAt(EAST_GATE[0], EAST_GATE[1]), z: EAST_GATE[1] });
      g.mat = mat;
      g.matAt = matAt;
      g.matYaw = Math.atan2(WIND.x, WIND.z);
      this.groups.push(g);
    }
    // (the grandchild runs between the grandfather and the father)
    const [ga, gb] = [this.groups[1], this.groups[2]];
    this.runTo.set(ga.members[2], [ga.lines[0].holder, gb.lines[0].holder]);
    this.runTo.set(runner, west.map((l) => l.holder));
    const spots = this.groups.map((g) => `${g.id} ${g.lines[0].holder.x.toFixed(0)},${g.lines[0].holder.z.toFixed(0)}`).join(' · ');
    console.info(`[map] kites: ${this.actors.length} people · ${this.groups.reduce((n, g) => n + g.lines.length, 0)} kites · ${things.used - boxes0} thing boxes · ${spots} · built in ${(performance.now() - t0).toFixed(1)} ms`);
  }

  private member(held: Look, job: Job, x: number, z: number, seed: number): Member {
    const bare: Look = held.carry === CARRY.kite ? { ...held, carry: CARRY.none, feats: held.feats.filter((f) => f !== FEAT.kite) } : held;
    const a = new Actor(this.env.crowd, bare, this.env.ground).avoid(this.env.traffic, this.name);
    this.actors.push(a);
    return { a, job, x, z, held, bare, seed, line: null };
  }

  private group(id: string, west: boolean, lines: Line[], members: Member[], stake: Point | null, stakeSlot: number, season: [number, number], from: number, to: number, gate: Point | null): Group {
    const h = lines[0].holder;
    return {
      id,
      west,
      lines,
      members,
      cx: h.x,
      cz: h.z,
      stake,
      stakeSlot,
      mat: -1,
      matAt: { x: 0, y: 0, z: 0 },
      matYaw: 0,
      season,
      from,
      to,
      gate,
      state: 'home',
      kiteAt: 'down',
      out: 0,
      bendAt: -1,
      pace: new Pace(220, KITES_FAR),
      seen: false,
      drawn: false,
      sayAt: -1e9,
      laughAt: 10 + id.length,
    };
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    this.blow(dt, f);
    const n = Math.min(1, Math.max(0, (f.night - 0.25) / 0.35));
    this.day = 1 - n * n * (3 - 2 * n);
    for (const g of this.groups) this.step(g, dt, now, f, ex);
    if (this.env.shot && f.dt > 0 && !this.logged) {
      this.logged = true;
      const at = (v: Vector3) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
      const up = this.groups.flatMap((g) => g.lines.filter((l) => l.kite.shown).map((l) => `${g.id} ${at(l.kite.mid)}`));
      console.info(`[map] kites up: ${up.join(' · ') || 'none'}`);
    }
  }

  /** The wind at kite height: the weather's direction, followed slowly, over a steady breeze aloft. */
  private blow(dt: number, f: MapFrame): void {
    const w = f.weather;
    if (Number.isNaN(this.windDir)) this.windDir = w.windDir;
    else this.windDir += wrap(w.windDir - this.windDir) * (1 - Math.exp(-Math.max(0, dt) / 8));
    this.wind.x = Math.sin(this.windDir);
    this.wind.z = Math.cos(this.windDir);
    this.wind.k = Math.min(1, 0.55 + 0.8 * w.wind);
  }

  /** Fair weather for kites: no rain, no storm, no snow. */
  private fair(f: MapFrame): boolean {
    const w = f.weather;
    return w.rain < 0.25 && w.storm < 0.3 && (w.snow ?? 0) < 0.2;
  }

  /** Should the group be out flying now? */
  private wantOut(g: Group, f: MapFrame): boolean {
    if (!this.fair(f)) return false;
    if (g.west) return (f.clock >= WEST_FROM || f.clock < WEST_TO) && f.night < WEST_DARK;
    return inSeason(f.season, g.season) && inWindow(f.clock, g.from, g.to);
  }

  /** Should its kite be tied up over the fields (the night, until they come back)? */
  private wantTied(g: Group, f: MapFrame): boolean {
    return !!g.stake && this.fair(f) && inSeason(f.season, g.season) && !inWindow(f.clock, g.from, g.to);
  }

  private step(g: Group, dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const d = viewDist(f, g.cx, g.cz);
    let st = g.pace.step(dt, d);
    if (st < 0) {
      this.hideAll(g);
      return;
    }
    if (st === 0 && g.drawn) return;
    if (st === 0) st = Math.max(dt, 1e-3);
    const want = this.wantOut(g, f);
    const tied = this.wantTied(g, f);
    if (d > PEOPLE_FAR) {
      // Far: nobody drawn; the day goes on by the clock, the kites fly on (less often).
      if (g.seen) this.hidePeople(g);
      this.snap(g, want, tied);
    } else {
      if (!g.seen) {
        this.snap(g, want, tied);
        this.arrive(g, now);
      }
      this.live(g, st, now, f, want, tied, ex);
    }
    // The stake stands through the season.
    if (g.stakeSlot >= 0 && g.stake) {
      if (!g.west && inSeason(f.season, g.season)) this.env.things.put(g.stakeSlot, g.stake.x, g.stake.y + 0.5, g.stake.z, 0.07, 1, 0.07);
      else this.env.things.hide(g.stakeSlot);
    }
    this.flyKites(g, now, f);
    g.drawn = true;
  }

  /** The group's state straight from the clock (far off, or when first seen). */
  private snap(g: Group, want: boolean, tied: boolean): void {
    if (want) {
      g.state = 'flying';
      g.kiteAt = 'held';
      g.out = 1;
    } else {
      g.state = 'home';
      g.kiteAt = tied ? 'tied' : 'down';
      g.out = tied ? 1 : 0;
    }
    g.bendAt = -1;
  }

  /** Everyone where the state has them, at once (a still, or the group coming into view). */
  private arrive(g: Group, now: number): void {
    g.seen = true;
    for (const m of g.members) {
      if (g.state !== 'flying') {
        if (m.a.shown) m.a.hide();
        continue;
      }
      this.dressFor(m, m.job === 'line');
      m.a.warp(m.x, this.floor(m.x, m.z), m.z, Math.atan2(this.wind.x, this.wind.z));
      m.a.show();
      m.a.carry(m.job === 'line' ? 1 : 0, now);
    }
  }

  private floor(x: number, z: number): number {
    const y = this.env.ground.at(x, z, 50);
    return Number.isFinite(y) ? y : this.env.ground.field.heightAt(x, z);
  }

  /** A line holder takes the reel (true) or puts it away. */
  private dressFor(m: Member, reel: boolean): void {
    const look = reel ? m.held : m.bare;
    if (m.a.look === look) return;
    m.a.look = look;
    this.env.crowd.dress(m.a.i, look);
  }

  /** The group's day, near: coming out, launching, flying, tying up or bringing the kite in, going home. */
  private live(g: Group, dt: number, now: number, f: MapFrame, want: boolean, tied: boolean, ex: Obstacle | null): void {
    const holder = g.lines[0].holder;
    switch (g.state) {
      case 'home':
        if (want && this.worth(g, f)) this.comeOut(g);
        else if (g.kiteAt === 'tied' && !tied) {
          // (the season, or rain, ends the night's flight: the tied kite comes down)
          g.out = Math.max(0, g.out - dt / LAND);
          if (g.out === 0) g.kiteAt = 'down';
        }
        break;
      case 'coming': {
        // The holder unties the line first if the kite spent the night on its stake; then everyone to their places.
        if (g.kiteAt === 'tied' && g.stake) {
          if (this.bend(g, holder, now)) {
            g.kiteAt = 'held';
            this.dressFor(holder, true);
          }
        } else if (holder.a.dist(holder.x, holder.z) < 0.4) {
          if (g.kiteAt === 'down') {
            g.kiteAt = 'held';
            g.out = 0;
            for (const l of g.lines) this.dressFor(l.holder, true);
          }
          g.state = 'flying';
        } else if (g.west) {
          for (const l of g.lines) this.dressFor(l.holder, true);
          if (g.kiteAt === 'down') g.kiteAt = 'held';
          g.out = 0;
          g.state = 'flying';
        }
        if (!want) g.state = g.kiteAt === 'held' ? 'landing' : 'going';
        break;
      }
      case 'flying':
        g.out = Math.min(1, g.out + dt / LAUNCH);
        if (!want) {
          g.state = tied ? 'tying' : 'landing';
          g.bendAt = -1;
        }
        break;
      case 'tying':
        if (this.bend(g, holder, now)) {
          g.kiteAt = 'tied';
          g.out = 1;
          this.dressFor(holder, false);
          g.state = 'going';
        } else if (want) g.state = 'flying';
        break;
      case 'landing':
        g.out = Math.max(0, g.out - dt / LAND);
        if (g.out === 0) {
          g.kiteAt = 'down';
          for (const l of g.lines) this.dressFor(l.holder, false);
          g.state = 'going';
        } else if (want) g.state = 'flying';
        break;
      case 'going': {
        let left = 0;
        for (const m of g.members) {
          if (!m.a.shown) continue;
          if (!g.gate || m.a.dist(g.gate.x, g.gate.z) < 1.2) m.a.hide();
          else left++;
        }
        if (!left) g.state = 'home';
        // (called back out before they are all gone: the clock turned back, the rain stopped)
        if (want && this.worth(g, f)) this.comeOut(g);
        break;
      }
    }
    // The mat lies there while someone sits by it (spread as they come, rolled up as they go).
    if (g.mat >= 0) {
      const a = g.matAt;
      let by = false;
      for (const m of g.members) if (m.job === 'sit' && m.a.shown && m.a.dist(a.x, a.z) < 2.5) by = true;
      if (by) {
        this.env.things.put(g.mat, a.x, a.y + 0.03, a.z, 2.3, 0.05, 1.6, g.matYaw);
        this.env.things.put(g.mat + 1, a.x, a.y + 0.045, a.z, 2.3, 0.05, 0.3, g.matYaw);
      } else this.env.things.hide(g.mat, 2);
    }
    for (const m of g.members) if (m.a.shown) this.person(g, m, dt, now);
    this.talk(g, now, f, ex);
  }

  /** Worth setting out: enough of the afternoon left (not out of the house only to go home again). */
  private worth(g: Group, f: MapFrame): boolean {
    return g.west || (((g.to - f.clock) % 1) + 1) % 1 > COME_LEFT;
  }

  /** Everyone not out yet comes out of the gate (the children: out of the house, in place); the kite waits. */
  private comeOut(g: Group): void {
    g.state = 'coming';
    g.bendAt = -1;
    for (const m of g.members) {
      if (m.a.shown) continue;
      const [x, z] = g.gate ? [g.gate.x + (m.seed - 0.5) * 2, g.gate.z + (m.seed - 0.5)] : [m.x, m.z];
      this.dressFor(m, false);
      m.a.warp(x, this.floor(x, z), z, 0);
      m.a.show();
    }
  }

  /** The holder goes to the stake and bends over it for `TIE` s; true once done. */
  private bend(g: Group, m: Member, now: number): boolean {
    const s = g.stake!;
    // (beside the stake, on the upwind side)
    const bx = s.x - WIND.x * 0.7;
    const bz = s.z - WIND.z * 0.7;
    if (g.bendAt < 0) {
      if (m.a.dist(bx, bz) < 0.35) g.bendAt = now;
      return false;
    }
    if (now - g.bendAt < TIE) return false;
    g.bendAt = -1;
    return true;
  }

  /** One person's step: where to go and how to stand for the group's state and their job. */
  private person(g: Group, m: Member, dt: number, now: number): void {
    const a = m.a;
    const kite = (m.line ?? g.lines[0]).kite;
    let gx = m.x;
    let gz = m.z;
    let speed = WALK;
    let pose: Pose = POSE.stand;
    let carry = 0;
    const up = kite.shown;
    // Face downwind (towards the kites) once standing.
    let faceYaw = Math.atan2(this.wind.x, this.wind.z);
    const atStake = m.job === 'line' && g.stake && ((g.state === 'coming' && g.kiteAt === 'tied') || g.state === 'tying');
    if (g.state === 'going' && g.gate) {
      gx = g.gate.x;
      gz = g.gate.z;
    } else if (atStake && g.stake) {
      gx = g.stake.x - WIND.x * 0.7;
      gz = g.stake.z - WIND.z * 0.7;
      faceYaw = Math.atan2(g.stake.x - gx, g.stake.z - gz);
      if (g.bendAt >= 0) pose = POSE.plant;
      carry = g.kiteAt === 'held' ? 1 : 0;
    } else if (m.job === 'line') {
      carry = g.kiteAt === 'held' ? 1 : 0;
      // A step back as it climbs, and a slow pace back and forth while it flies (paying the line out, taking it in).
      const back = g.state === 'flying' ? 0.8 * (1 - g.out) + 0.35 * Math.sin(now * 0.21 + m.seed * 9) : 0;
      gx -= this.wind.x * back;
      gz -= this.wind.z * back;
      // (walking up at a walk; at the spot, slow steps)
      if (a.dist(gx, gz) < 2) speed = 0.6;
    } else if (m.job === 'run') {
      const to = this.runTo.get(m);
      if (to && g.state === 'flying') {
        const n = to.length * 2;
        const k = ((Math.floor((now + m.seed * 40) / 14) % n) + n) % n;
        const t = to[k < to.length ? k : n - 1 - k];
        gx = t.x + 1.6 * this.wind.z;
        gz = t.z - 1.6 * this.wind.x;
        speed = RUN;
      }
    } else if (m.job === 'watch' && g.state === 'flying') {
      // Looking up at the kite, pointing now and then; (the pose cycles on their own clock)
      const c = (now + m.seed * 30) % 30;
      pose = c < 12 ? POSE.look : c > 20 && c < 24 ? POSE.point : POSE.stand;
    } else if (m.job === 'sit' && g.state === 'flying') {
      if (a.dist(gx, gz) < 0.35) pose = POSE.sit;
    }
    if (a.dist(gx, gz) > 0.15) a.goTo(gx, gz, speed);
    else a.stop();
    a.face(faceYaw);
    a.pose(pose, now);
    a.carry(carry, now);
    a.lookAt(up && g.state !== 'going' ? kite.mid : null, now + 1);
    a.step(dt, now);
  }

  /** Words to the explorer close by (roaming only; one bubble at a time, now and then), laughter from the small ones. */
  private talk(g: Group, now: number, f: MapFrame, ex: Obstacle | null): void {
    if (f.dt > 0 && g.state === 'flying' && now > g.laughAt) {
      g.laughAt = now + 16 + 18 * frac(Math.sin(now * 91.7 + g.cx) * 4375.5);
      for (const r of g.members)
        if (r.job === 'run' && r.a.shown) {
          f.calls.push({ kind: 'laugh', x: r.a.x, y: r.a.y + 1.2, z: r.a.z, gain: 0.8 });
          break;
        }
    }
    if (!ex || this.env.shot || g.state !== 'flying' || this.env.bubble.showing || now - g.sayAt < SAY_EVERY) return;
    // The grandfather asks if he hears the ek; the eldest child boasts of his kite.
    const who = g.id === 'grandfather' ? g.lines[0].holder : g.west ? g.lines[1].holder : null;
    if (!who || who.a.dist(ex.x, ex.z) > SAY_NEAR) return;
    g.sayAt = now;
    const a = who.a;
    const crowd = this.env.crowd;
    this.env.bubble.say(g.west ? 'ktHighest' : 'ktHear', () => ({ x: a.x, y: a.y + 2.9 * (crowd.scale(a.i) / 1.4), z: a.z }), 3.4);
    EX.x = ex.x;
    EX.y = ex.y + 2;
    EX.z = ex.z;
    a.lookAt(EX, now + 2.5);
  }

  /** Every kite of the group: flown from the hand (or the stake), or brought down and hidden; the hum. */
  private flyKites(g: Group, now: number, f: MapFrame): void {
    for (const line of g.lines) {
      const kite = line.kite;
      if (g.kiteAt === 'down' || (g.out <= 0.001 && g.kiteAt !== 'held')) {
        kite.hide();
        continue;
      }
      const m = line.holder;
      let ax: number;
      let ay: number;
      let az: number;
      if (g.kiteAt === 'tied' && g.stake) {
        ax = g.stake.x;
        ay = g.stake.y + 0.95;
        az = g.stake.z;
      } else if (m.a.shown) {
        this.env.crowd.handAt(m.a.i, H);
        ax = H.x;
        ay = H.y;
        az = H.z;
      } else {
        ax = m.x;
        ay = this.env.ground.field.heightAt(m.x, m.z) + 1.7 * m.a.look.height;
        az = m.z;
      }
      // (in the hands before the launch: out a little, low)
      kite.light(this.day);
      kite.fly(ax, ay, az, this.wind, Math.max(0.02, g.out), now);
      this.hum(line, g, now, f);
    }
  }

  /** A phrase of the ek's hum every few seconds while the listener is near (not in stills). */
  private hum(line: Line, g: Group, now: number, f: MapFrame): void {
    const kite = line.kite;
    if (kite.look.kind !== 'ek' || f.dt <= 0 || this.env.shot || g.out < 0.3 || now < line.humAt) return;
    line.humAt = now + 3.2 + 2.4 * frac(Math.sin(now * 12.9 + line.voice * 78.2) * 43758.5);
    const m = kite.mid;
    const l = f.listener;
    const dx = m.x - l.x;
    const dy = m.y - l.y;
    const dz = m.z - l.z;
    if (dx * dx + dy * dy + dz * dz > HUM_REACH * HUM_REACH) return;
    // Louder in a stronger wind and from a bigger bow.
    const k = this.wind.k;
    const blow = Math.min(1, Math.max(0, (k - 0.4) / 0.5));
    const gain = (0.35 + 0.65 * blow) * (0.6 + 0.4 * Math.min(1, kite.look.size / 3.6)) * Math.min(1, g.out * 1.4);
    f.calls.push({ kind: 'kiteHum', x: m.x, y: m.y, z: m.z, gain, size: line.voice });
  }

  private hidePeople(g: Group): void {
    g.seen = false;
    for (const m of g.members) if (m.a.shown) m.a.hide();
    if (g.mat >= 0) this.env.things.hide(g.mat, 2);
  }

  private hideAll(g: Group): void {
    if (!g.drawn) return;
    g.drawn = false;
    this.hidePeople(g);
    for (const l of g.lines) l.kite.hide();
    if (g.stakeSlot >= 0) this.env.things.hide(g.stakeSlot);
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }

  /** Flying khleng ek, for the nature book. */
  subjects(out: Subject[]): void {
    for (const g of this.groups)
      for (const l of g.lines) {
        const k = l.kite;
        if (k.shown && k.look.kind === 'ek') out.push({ kind: 'khlengEk', x: k.mid.x, y: k.mid.y, z: k.mid.z, r: k.r });
      }
  }
}

/** (index.ts builds the scene by its first name, from when only the children flew) */
export { KiteFlyers as KiteKids };

/**
 * The size a kite's ek sings for (m): its own (a big male kite, the deepest),
 * a female kite's (round wings) as a smaller bow's, which sings high.
 */
function voiceOf(look: KiteLook): number {
  return look.size * (look.tips === 'round' ? 0.62 : 1);
}

/** In the season's window (`season`, no wrap). */
function inSeason(s: number, [a, b]: [number, number]): boolean {
  return s >= a && s <= b;
}

/** In the clock's window (from → to, wrapping past 1). */
function inWindow(c: number, from: number, to: number): boolean {
  return from <= to ? c >= from && c < to : c >= from || c < to;
}

/**
 * A spot near (x, z) with room to fly a kite: grass or dirt, dry, fairly
 * flat, no trunk within reach, and no crown over the line's first 30 m
 * downwind (the trees are the vegetation's, planted before the people).
 */
function clearSpot(field: HeightField, x: number, z: number): Point {
  const canopy = canopyOf(field);
  const ok = (px: number, pz: number): boolean => {
    const s = field.surfaceAt(px, pz);
    if ((s !== SURFACE.grass && s !== SURFACE.dirt) || field.waterAt(px, pz) !== null) return false;
    const y = field.heightAt(px, pz);
    for (const [ox, oz] of [
      [3, 0],
      [-3, 0],
      [0, 3],
      [0, -3],
    ])
      if (Math.abs(field.heightAt(px + ox, pz + oz) - y) > 1.2) return false;
    if (!canopy) return true;
    let blocked = false;
    canopy.near(px - 3, pz - 3, px + 3, pz + 3, 4, (n) => {
      const t = canopy.trees[n];
      if (len(t.x - px, t.z - pz) < canopy.trunk[n] + 2.6) blocked = true;
    });
    for (let d = 6; d <= 30 && !blocked; d += 6) {
      const lx = px + WIND.x * d;
      const lz = pz + WIND.z * d;
      const ly = y + 1.6 + d * 0.84;
      canopy.near(lx - 1, lz - 1, lx + 1, lz + 1, 9, (n) => {
        const t = canopy.trees[n];
        if (len(t.x - lx, t.z - lz) < t.r + 1 && t.y + t.h > ly) blocked = true;
      });
    }
    return !blocked;
  };
  for (let r = 0; r <= 14; r += 2)
    for (let k = 0; k < (r ? 8 : 1); k++) {
      const px = x + r * Math.cos((k * Math.PI) / 4);
      const pz = z + r * Math.sin((k * Math.PI) / 4);
      if (ok(px, pz)) return { x: px, y: field.heightAt(px, pz), z: pz };
    }
  return { x, y: field.heightAt(x, z), z };
}

function frac(x: number): number {
  return x - Math.floor(x);
}
