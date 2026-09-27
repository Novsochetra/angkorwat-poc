import { hash3 } from '../../voxel/random';
import { GREET, setNearbyFinder, type Nearby } from '../greet';
import type { MapFrame, PeopleCallKind } from '../types';
import type { WordKey } from '../ui/lang';
import { wrap, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { CARRY, FEAT, POSE, SLOT, type Feature, type Look, type Pose } from './_personModel';
import { len, type Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * People greet the explorer back (index.ts: `update` once a frame, right
 * after the scenes have stepped). When he greets (greet.ts `GREET`, from
 * roam/_greet.ts), those who can see him answer, each after a moment (the
 * nearer first), in their own way:
 *
 * - **his sampeah**: up to six people within 8 m in front of him who face
 *   his way (4 m off, whoever can turn round notices him from behind too;
 *   up or down a stair, a veranda). Grown-ups — villagers, sellers, the palm tapper, fishermen,
 *   pilgrims, the guide, the apsara dancers before the show — turn to him and sampeah back
 *   ("ជម្រាបសួរ", "សុខសប្បាយទេ?", "សួស្ដី"; a seller "អញ្ជើញ!"; an elder,
 *   grey-haired, nods low over the palms: "សុខសប្បាយទេ ចៅ?"); sitting on
 *   the floor they come up on their knees for it (`POSE.kneel`); children
 *   wave, some hop, and call "សួស្ដី!"; monks do not sampeah lay people: a
 *   nod (`POSE.nod`) and now and then a blessing, "សូមឱ្យសុខសប្បាយ";
 *   visitors wave: "Hello!".
 * - **his wave** (nobody near, or to a visitor or a child): up to four who
 *   see him within 20 m wave back, children first, then visitors; grown-ups
 *   wave or nod, monks nod.
 *
 * Who is busy keeps at it — rowing, dancing, a net mid-throw, bent over the
 * paddy, up a ladder, a load on the head or the shoulder pole, a kite's
 * string or a torch in the hands, at a show (`Actor.performing`: the apsara
 * dancers and the seated pinpeat players never stop or kneel up) — and
 * only turns the head to him (a little nod) and says it. Walking people
 * answer on the move (a nod, a child's wave), not
 * stopping (and so does anyone their scene walks on in the middle of an
 * answer); riders (a boat, the cart) and people sitting do not turn round.
 * The three nearest say it in a bubble, and each of them has a voice (a
 * `hello` or `kidHello` call, audio/people.ts; a child may laugh after).
 *
 * They hold it about 2 s, then the scene's own pose comes back
 * (`Actor.held` / `release`: the scene runs on underneath, its pose kept)
 * and the scene turns them back its way. Anyone who answered does not
 * answer again for 8 s (F over and over does not keep everyone bowing).
 * Nothing runs between greetings. It also lends roaming the finder for the
 * person nearest him in front (greet.ts `nearby`).
 */

/** How far (m) people answer his sampeah, and his wave; how many at most. */
const NEAR = 8;
const FAR = 20;
const MAX_NEAR = 6;
const MAX_FAR = 4;
/** In front of him: at most this far round from his facing (radians, either side), for the sampeah and for the wave. */
const FRONT_NEAR = 1.4;
const FRONT_FAR = 1.05;
/**
 * They see him: he is at most this far round from where they face (radians;
 * farther round, behind them, they miss it) — unless he is this close (m)
 * and they can turn round to him: then they notice him anyway.
 */
const SEE_NEAR = 2.0;
const SEE_FAR = 1.4;
const NOTICE = 4;
/** On about his floor: this far up or down (m), and this much more a metre away (a stair, a slope, a veranda over him). */
const LEVEL = 2.5;
const LEVEL_SLOPE = 0.5;
/** A moment before each answers (s; the nearest first), and how long they hold it (s). */
const DELAY = [0.2, 0.9] as const;
const HOLD = [1.9, 2.5] as const;
/** Not again for this long (s) after answering. */
const AGAIN = 8;
/** Bubbles (and voices) at once: the nearest who answer; each one more steps up this much (m) over the head. */
const SPEAK = 3;
const BUBBLE_STEP = 0.55;
/** A bubble stays this much longer than the answer (s). */
const SAY_MORE = 0.4;
/** Turning to him (radians a second). */
const TURN = 3.2;
/** Faster than this (m/s) they answer on the move. */
const WALKING = 0.3;
/** His eyes over his feet (m, the roaming explorer: 1.4 × 1.7 m tall). */
const EYE = 2.0;

/**
 * Poses a greeting must not break: rowing, the dance, a throw, bent over the
 * paddy, sweeping, stirring the wok, up a ladder, handing something over,
 * eating, on a bicycle, in a hammock.
 */
const BUSY: ReadonlySet<number> = new Set<number>([POSE.row, POSE.dance, POSE.cast, POSE.plant, POSE.reap, POSE.sweep, POSE.stir, POSE.climb, POSE.give, POSE.eat, POSE.ride, POSE.hammock]);
/** Sitting, squatting or kneeling: they stay down; sitting on the floor (`sit`) they come up on their knees to sampeah. */
const SEATED: ReadonlySet<number> = new Set<number>([POSE.sit, POSE.kneel, POSE.stool, POSE.squat, POSE.eat, POSE.hammock, POSE.ride]);
/** Things that fill the hands (or the head): a kite's string, a torch, the shoulder pole, a basket on the head, a tray. */
const BUSY_FEATS: readonly Feature[] = [FEAT.kite, FEAT.torch, FEAT.pole, FEAT.headBasket, FEAT.tray];

/** What an answer shows: the sampeah, kneeling up for it, a wave, a nod, or only a look (busy). */
type How = 'sampeah' | 'kneel' | 'wave' | 'nod' | 'look';
const POSE_OF: Record<How, Pose | null> = { sampeah: POSE.sampeah, kneel: POSE.kneel, wave: POSE.wave, nod: POSE.nod, look: null };
/** How deep the head nods at the lowest (0‥1 down; the sampeah and the nod poses bow the head themselves too: a nod without its pose, walking or busy, is the head's alone). */
const NOD: Record<How, number> = { sampeah: 0.25, kneel: 0.25, wave: 0, nod: 0.2, look: 0.35 };
const NOD_HEAD = 0.6;

interface Answer {
  a: Actor;
  how: How;
  /** The people's clock (s): it starts, it lets go. */
  from: number;
  to: number;
  started: boolean;
  /** Turns round to him (standing on their feet), and the way it faces now. */
  turn: boolean;
  yaw: number;
  /** A child hopping as it waves. */
  hop: boolean;
  nod: number;
  word: WordKey | null;
  call: PeopleCallKind | null;
  /** The hold on the actor (`Actor.held`: its `at` follows his head). */
  hold: { at: Point; nod: number; pose: boolean };
}

/** A bubble for one of the nearest who answer, following their head. */
interface Speaker {
  bubble: Bubble;
  a: Actor | null;
  /** Its bubble shows (or fades) until then (people's clock, s). */
  until: number;
  /** Raised this much (m) over the head: bubbles side by side step up, so they do not cover each other. */
  lift: number;
  head: Point;
  at: () => Point;
}

export class GreetBack {
  /** The last greeting answered (`GREET.n`). */
  private seen = 0;
  private readonly live: Answer[] = [];
  private readonly spare: Answer[] = [];
  private readonly speakers: Speaker[] = [];
  /** When each person (crowd index) last answered (people's clock, s). */
  private readonly last: Float64Array;
  /** Bubbles on screen until then (people's clock, s): they are updated only till then. */
  private talking = -1e9;
  private readonly cand: { a: Actor; d: number; rank: number }[] = [];
  /** Where he is (feet): the traffic's explorer while he walks, else where he greeted. */
  private readonly him: Point = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly env: PeopleEnv,
    private readonly actors: readonly Actor[],
  ) {
    this.last = new Float64Array(env.crowd.capacity).fill(-1e9);
    for (let k = 0; k < SPEAK; k++) this.speakers.push(speaker());
    setNearbyFinder((x, y, z, yaw, range, cone, out) => this.find(x, y, z, yaw, range, cone, out));
  }

  /** Once a frame, after the scenes' steps (`now`: the people's clock). */
  update(dt: number, now: number, f: MapFrame): void {
    const ex = this.env.traffic.explorer;
    // (a new greeting, answered while he is on foot among them: a shot's warm-up runs without him first)
    if (GREET.n !== this.seen && ex) {
      this.seen = GREET.n;
      this.choose(now);
    }
    if (!this.live.length && now > this.talking) return;
    const h = this.him;
    h.x = ex ? ex.x : GREET.x;
    h.y = ex ? ex.y : GREET.y;
    h.z = ex ? ex.z : GREET.z;
    const crowd = this.env.crowd;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const r = this.live[k];
      const a = r.a;
      const u = now - r.from;
      // (gone meanwhile: into the temple, home for the night)
      if (!a.shown) {
        this.done(k, now, f, false);
        continue;
      }
      if (u < 0) continue;
      if (!r.started) this.start(r, now, f);
      if (now >= r.to) {
        this.done(k, now, f, true);
        continue;
      }
      // (their scene walks them on meanwhile — back to the stall, on along the way: a pose held would slide over the
      // ground; they answer on the move instead, as walkers do: the head's nod, not turned round)
      if ((r.hold.pose || r.turn) && a.speed > WALKING) {
        if (r.hold.pose) a.release(now);
        r.hold.pose = r.turn = r.hop = false;
        r.nod = NOD_HEAD;
        a.held = r.hold;
      }
      // Looking at him: his eyes; the nod dips and comes back up.
      r.hold.at.x = h.x;
      r.hold.at.y = h.y + EYE;
      r.hold.at.z = h.z;
      r.hold.nod = r.nod * bump(u, 0.3, 1.25);
      // Turning to him (standing on their feet), and a child's hops; the scene turns them back after.
      let hop = 0;
      if (r.hop && u < 1.1) hop = 0.16 * crowd.scale(a.i) * Math.max(0, Math.sin((u / 0.55) * Math.PI * 2));
      if (r.turn) {
        const want = Math.atan2(h.x - a.x, h.z - a.z);
        r.yaw = wrap(r.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - r.yaw))));
        a.yaw = r.yaw;
      }
      if (r.turn || hop > 0) crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
    }
    // The bubbles (only while one shows or fades).
    if (now <= this.talking) for (const s of this.speakers) s.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  /** Who answers this greeting, how, and when. */
  private choose(now: number): void {
    const g = GREET;
    const sampeah = g.kind === 'sampeah';
    const range = sampeah ? NEAR : FAR;
    const front = Math.cos(sampeah ? FRONT_NEAR : FRONT_FAR);
    const see = sampeah ? SEE_NEAR : SEE_FAR;
    const fx = Math.sin(g.yaw);
    const fz = Math.cos(g.yaw);
    const cand = this.cand;
    cand.length = 0;
    for (const a of this.actors) {
      if (!a.shown || a.held || !a.crowd.isShown(a.i) || now - this.last[a.i] < AGAIN) continue;
      const dx = a.x - g.x;
      const dz = a.z - g.z;
      const d = len(dx, dz);
      if (d > range || d < 0.05 || (dx * fx + dz * fz) / d < front || Math.abs(a.y - g.y) > LEVEL + LEVEL_SLOPE * d) continue;
      // (he is where they can see him: not behind them — close by, whoever can turn round notices him anyway)
      if (Math.abs(wrap(Math.atan2(-dx, -dz) - a.yaw)) > see && (d > NOTICE || !sampeah || !this.canTurn(a))) continue;
      const kind = a.look.kind;
      // (a wave is answered by the children first, then the visitors)
      const rank = sampeah ? 0 : kind === 'kid' ? 0 : kind === 'visitor' ? 1 : 2;
      cand.push({ a, d, rank });
    }
    cand.sort((p, q) => p.rank - q.rank || p.d - q.d);
    const n = Math.min(cand.length, sampeah ? MAX_NEAR : MAX_FAR);
    for (let k = 0; k < n; k++) this.plan(cand[k].a, cand[k].d / range, k, sampeah, now);
    // (checks: who answers, how, how far)
    if (this.env.shot) {
      const who = this.live.map((r) => `${r.a.look.kind} ${r.how}${r.word ? ` "${r.word}"` : ''} ${len(r.a.x - g.x, r.a.z - g.z).toFixed(1)} m`);
      console.info(`[map] greet: ${g.kind} at (${g.x.toFixed(1)}, ${g.z.toFixed(1)}) → ${who.length ? who.join(', ') : 'nobody answers'}`);
    }
  }

  /** One person's answer: how (by who they are and what they are doing), when, what they say. */
  private plan(a: Actor, far: number, order: number, sampeah: boolean, now: number): void {
    const look = a.look;
    const kind = look.kind ?? 'villager';
    const pose = a.currentPose;
    const r1 = hash3(a.i, GREET.n, 3, 71);
    const r2 = hash3(a.i, GREET.n, 5, 72);
    const walking = a.speed > WALKING;
    const seated = SEATED.has(pose);
    const busy = this.busy(a);
    const kid = kind === 'kid';
    const elder = isElder(look);
    let how: How;
    if (kind === 'monk') how = 'nod';
    else if (busy) how = 'look';
    else if (kid || kind === 'visitor') how = seated ? 'look' : 'wave';
    else if (walking) how = 'nod';
    else if (seated) how = sampeah && pose === POSE.sit ? 'kneel' : 'nod';
    else if (!sampeah) how = r1 < 0.6 ? 'wave' : 'nod';
    else how = 'sampeah';
    const r = this.spare.pop() ?? { a, how, from: 0, to: 0, started: false, turn: false, yaw: 0, hop: false, nod: 0, word: null, call: null, hold: { at: { x: 0, y: 0, z: 0 }, nod: 0, pose: false } };
    r.a = a;
    r.how = how;
    r.from = now + DELAY[0] + (DELAY[1] - DELAY[0]) * far + 0.12 * r2;
    r.to = r.from + HOLD[0] + (HOLD[1] - HOLD[0]) * r1;
    r.started = false;
    r.turn = this.canTurn(a);
    r.yaw = a.yaw;
    r.hop = kid && !walking && !seated && !a.riding && r2 < 0.6;
    // (a nod standing still is the pose of it, `POSE.nod`; walking, sitting or busy, only the head)
    r.hold.pose = POSE_OF[how] !== null && !(how === 'nod' && (walking || seated || busy));
    r.nod = elder && how === 'sampeah' ? 0.55 : how === 'nod' && !r.hold.pose ? NOD_HEAD : NOD[how];
    // What they say (the nearest few): by who they are.
    const speaks = order < SPEAK && (kind !== 'monk' || (sampeah && r1 < 0.6));
    r.word = !speaks ? null : wordFor(kind, elder, sampeah, r1, r2);
    r.call = !r.word ? null : kid ? 'kidHello' : kind === 'monk' ? null : 'hello';
    this.live.push(r);
  }

  /** Their answer begins: hold them, show it, say it. */
  private start(r: Answer, now: number, f: MapFrame): void {
    r.started = true;
    const a = r.a;
    r.yaw = a.yaw;
    r.hold.at.x = this.him.x;
    r.hold.at.y = this.him.y + EYE;
    r.hold.at.z = this.him.z;
    r.hold.nod = 0;
    a.held = r.hold;
    const pose = POSE_OF[r.how];
    if (pose !== null && r.hold.pose) a.crowd.pose(a.i, pose, now);
    if (r.word) {
      // (a free bubble, or the one that has shown longest)
      let s = this.speakers[0];
      for (const q of this.speakers) if (q.until < s.until) s = q;
      let up = 0;
      for (const q of this.speakers) if (q !== s && q.until > now && q.a) up = Math.max(up, q.lift + BUBBLE_STEP);
      s.a = a;
      s.lift = up;
      // (the words stay a moment longer than the pose: time to read them)
      s.until = r.to + SAY_MORE + 0.8;
      s.bubble.say(r.word, s.at, r.to - now + SAY_MORE);
      this.talking = Math.max(this.talking, s.until);
    }
    // (`size`: the greeter's height, so the voice fits them: a woman's under 1.63 m, the smallest child's under 1.2 m — audio/speech.ts)
    if (r.call && f.dt > 0) f.calls.push({ kind: r.call, x: a.x, y: a.y + 1.6 * a.crowd.scale(a.i), z: a.z, gain: 0.9, size: 1.7 * a.crowd.scale(a.i) });
  }

  /** Their answer is over (or they went): the scene's own pose again; not again for a while. */
  private done(k: number, now: number, f: MapFrame, over: boolean): void {
    const r = this.live[k];
    const a = r.a;
    a.release(now);
    this.last[a.i] = now;
    // (a child laughs after, now and then)
    if (over && r.how === 'wave' && r.hop && r.call && f.dt > 0) f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.5 });
    this.live.splice(k, 1);
    this.spare.push(r);
  }

  /** At something a greeting must not break (a pose, full hands, up a ladder, a show): only the head turns. */
  private busy(a: Actor): boolean {
    const look = a.look;
    return a.performing || BUSY.has(a.currentPose) || look.feats.some((ft) => BUSY_FEATS.includes(ft)) || look.carry === CARRY.kite || this.aloft(a);
  }

  /** Standing on their feet, free: they turn round to him (riders, people sitting or walking and the busy do not). */
  private canTurn(a: Actor): boolean {
    return !a.riding && a.speed <= WALKING && !SEATED.has(a.currentPose) && !this.busy(a);
  }

  /** Up a ladder or a palm (riding high over dry land), not standing in a boat. */
  private aloft(a: Actor): boolean {
    if (!a.riding) return false;
    const field = this.env.ground.field;
    const w = field.waterAt(a.x, a.z);
    if (w !== null && a.y < w + 1.2) return false;
    return a.y > field.heightAt(a.x, a.z) + 1.5;
  }

  /** The person nearest (x, y, z) in front (greet.ts `NearbyFinder`): for roaming's sampeah or wave. */
  private find(x: number, y: number, z: number, yaw: number, range: number, cone: number, out: Nearby): boolean {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const front = Math.cos(cone);
    let best: Actor | null = null;
    let bd = range;
    for (const a of this.actors) {
      if (!a.shown || !a.crowd.isShown(a.i)) continue;
      const dx = a.x - x;
      const dz = a.z - z;
      const d = len(dx, dz);
      if (d >= bd || d < 0.05 || (dx * fx + dz * fz) / d < front || Math.abs(a.y - y) > LEVEL + LEVEL_SLOPE * d) continue;
      bd = d;
      best = a;
    }
    if (!best) return false;
    out.x = best.x;
    out.y = best.y;
    out.z = best.z;
    out.d = bd;
    out.kind = best.look.kind ?? '';
    out.elder = isElder(best.look);
    return true;
  }
}

/** A bubble of its own, over the head of whoever it is given to (a shared point: no new object a frame). */
function speaker(): Speaker {
  const head: Point = { x: 0, y: 0, z: 0 };
  const s: Speaker = {
    bubble: new Bubble(),
    a: null,
    until: -1e9,
    lift: 0,
    head,
    at: () => {
      const a = s.a;
      if (a) {
        head.x = a.x;
        head.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4) + s.lift;
        head.z = a.z;
      }
      return head;
    },
  };
  return s;
}

/** A smooth rise and fall over [a, b] (s): 0 outside, 1 in the middle. */
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}

/** An elder: grey or white hair (the kinds' old looks, _kinds.ts), not a monk's shaven head. */
function isElder(look: Look): boolean {
  if (look.kind === 'monk' || look.kind === 'kid') return false;
  const c = look.colors[SLOT.hair] ?? 0;
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return Math.max(r, g, b) - Math.min(r, g, b) < 24 && (r + g + b) / 3 > 70;
}

/** What they say back (ui/lang.ts `gr…`). */
function wordFor(kind: string, elder: boolean, sampeah: boolean, r1: number, r2: number): WordKey {
  if (kind === 'kid') return r2 < 0.55 ? 'grKid' : 'grKidBong';
  if (kind === 'visitor') return r2 < 0.5 ? 'grVisitor' : 'grVisitorHi';
  if (kind === 'monk') return 'grMonk';
  if (!sampeah) return 'grHi';
  if (kind === 'vendor') return 'grWelcome';
  if (elder) return 'grElder';
  return r2 < 0.5 ? 'grHello' : r1 < 0.5 ? 'grHowAreYou' : 'grHi';
}
