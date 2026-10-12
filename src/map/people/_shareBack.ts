import { HOME } from '../hamlet/_homePlan';
import { setShareFinder, SHARE, type SharePhase, type ShareWho } from '../share';
import type { MapFrame } from '../types';
import { lang, t, type WordKey } from '../ui/lang';
import { wrap, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { isElder } from './_greetBack';
import { CARRY, FEAT, POSE, SLOT, type Feature, type Look } from './_personModel';
import { len, type Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * People take the fruit he shares (index.ts: `update` once a frame, after the
 * greetings, the sales and the smiles; the explorer's side:
 * roam/_shareFruit*.ts, cued by share.ts `SHARE`). It also lends roaming the
 * finder of whom he may give to (`setShareFinder`): a Khmer grown-up, elder or
 * child free to take something — not a monk, a visitor from abroad, a guide
 * at work, a dancer or musician at the show, someone praying, rowing, casting
 * a net, up a ladder, on a bicycle, in a boat or a cart, with a kite's string,
 * a torch, a shoulder pole, a basket on the head or a tray in the hands, nor
 * anyone another moment holds (a greeting, a sale, a smile for his camera).
 *
 * What they do (`SHARE.phase`):
 * - `come`: a grown-up stands up from their work (a farmer straightens up from
 *   the rice), turns to him and looks at him; sitting, they stay down and look
 *   up. A child runs to him (`SHARE.meetX/Z`, about 2.4 m/s) and stands before
 *   him (`SHARE.arrived`).
 * - `hold`: standing, they reach out with both hands (`POSE.give`).
 * - `take`: the fruit is in their hands (`FEAT.fruit`, its colours on `prop`
 *   and `prop2`; worn over their look with `Crowd.strike`, their carry style
 *   put aside meanwhile).
 * - `thanks`: their words in a bubble (and a voice); a grown-up sampeahs, the
 *   fruit between the palms (sitting on the floor: up on their knees); an elder
 *   nods; a child jumps with it held up (`POSE.cheer`), a laugh.
 * - `back`: they hold out what they give back (`FEAT.parcel` in the snack's or the
 *   seed packet's colours), or (an elder) bless him, a hand raised (`POSE.nod`).
 * - `end`: a grown-up looks at the fruit a moment, then goes back to what they did
 *   (it goes in their basket, their bag); a child runs back to the others with it.
 * - `again`: one today already: "ខ្ញុំមានហើយ អរគុណ!", a nod (a child waves).
 * - `none`: back to what they did at once.
 *
 * Their scene runs on underneath (`Actor.held`: its pose kept for after; a
 * child's place is this module's until it is back). Nothing runs between givings
 * but the finder, asked by roaming each step he is on foot with fruit in his
 * basket (one pass over the people, no allocation). Shots log `[map] share: …`.
 */

/** On about his floor (m), and this much more a metre away. */
const LEVEL = 2.0;
const LEVEL_SLOPE = 0.4;
/** Turning to him (radians a second). */
const TURN = 3.4;
/** His eyes over his feet (m, the roaming explorer). */
const EYE = 2.0;
/** A child runs this fast (m/s) to him and back. */
const RUN = 2.4;
const RUN_BACK = 2.0;
/** A grown-up looks at the fruit this long (s) after; a child is back with the others this long (s) before letting go. */
const LOOK_AT = 2.2;
const BACK_HOME = 1.2;
/** Their words stay this long (s). */
const SAY = 2.6;
/** A child's jump: how high (share of its size) and how long (s). */
const HOP = 0.16;
const HOP_AT = 0.3;
const HOP_FOR = 0.55;

/** Poses that keep them from taking anything: rowing, dancing, a throw, up a ladder, on a bicycle, in a hammock, praying, chanting, blessing. */
const NO: ReadonlySet<number> = new Set<number>([POSE.row, POSE.dance, POSE.cast, POSE.climb, POSE.ride, POSE.hammock, POSE.bless, POSE.chant, POSE.kneel, POSE.bow, POSE.sampeah, POSE.give]);
/** Sitting, squatting: they stay down (he bends to them). */
const SEATED: ReadonlySet<number> = new Set<number>([POSE.sit, POSE.stool, POSE.squat, POSE.eat]);
/** Things that fill the hands (or the head). */
const FULL_HANDS: readonly Feature[] = [FEAT.kite, FEAT.torch, FEAT.pole, FEAT.headBasket, FEAT.tray, FEAT.offering, FEAT.paddle];
/** Kinds that are never given to here (monks are the offering's; visitors, the guide, the dancers). */
const NOT: ReadonlySet<string> = new Set(['monk', 'visitor', 'guide', 'dancer']);

const FRUIT: readonly Feature[] = [FEAT.fruit];
const PARCEL: readonly Feature[] = [FEAT.parcel];

/** One person taking (or having taken) his fruit. */
interface Taker {
  a: Actor;
  kid: boolean;
  seated: boolean;
  /** Sitting on the floor (they come up on their knees to sampeah). */
  floor: boolean;
  elder: boolean;
  /** What it is doing, since when (the people's clock). */
  phase: SharePhase;
  since: number;
  /** The hold on the actor (`Actor.held`). */
  hold: { at: Point; nod: number; pose: boolean };
  yaw: number;
  /** A child: where it ran from, where it is (this module moves it), whether it is moved now. */
  ox: number;
  oz: number;
  x: number;
  z: number;
  moved: boolean;
  /** Wearing: the fruit, the parcel, nothing; their own look before (for the colours). */
  wearing: 'none' | 'fruit' | 'parcel';
  before: Look | null;
  /** Let go at (the people's clock: after `end`, `again`, `none`). */
  until: number;
}

export class ShareBack {
  private seen = 0;
  /** The one he gives to now (SHARE.id), and those still finishing (a child running back). */
  private cur: Taker | null = null;
  private readonly after: Taker[] = [];
  private readonly spare: Taker[] = [];
  private readonly byIndex: (Actor | undefined)[] = [];
  private readonly bubble = new Bubble();
  private talking = -1e9;
  private speaker: Actor | null = null;
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => {
    const a = this.speaker;
    if (a) {
      this.head.x = a.x;
      this.head.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4);
      this.head.z = a.z;
    }
    return this.head;
  };
  private readonly him: Point = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly env: PeopleEnv,
    private readonly actors: readonly Actor[],
  ) {
    for (const a of actors) this.byIndex[a.i] = a;
    setShareFinder((x, y, z, yaw, range, cone, kids, skip, out) => this.find(x, y, z, yaw, range, cone, kids, skip, out));
  }

  /** Once a frame, after the scenes' steps, the greetings, the sales and the smiles (`now`: the people's clock). */
  update(dt: number, now: number, f: MapFrame): void {
    this.lastNow = now;
    const ex = this.env.traffic.explorer;
    const h = this.him;
    h.x = ex ? ex.x : SHARE.x;
    h.y = (ex ? ex.y : SHARE.y) + EYE;
    h.z = ex ? ex.z : SHARE.z;
    if (SHARE.n !== this.seen) {
      this.seen = SHARE.n;
      this.cue(now, f);
    }
    const c = this.cur;
    if (c) {
      if (!c.a.shown || (c.a.held && c.a.held !== c.hold)) {
        SHARE.lost = true;
        this.letGo(c, now);
        this.cur = null;
      } else {
        this.play(c, dt, now, f);
        SHARE.px = c.a.x;
        SHARE.py = c.a.y;
        SHARE.pz = c.a.z;
      }
    }
    for (let k = this.after.length - 1; k >= 0; k--) {
      const r = this.after[k];
      if (!r.a.shown || (r.a.held && r.a.held !== r.hold) || now >= r.until) {
        this.letGo(r, now);
        this.after.splice(k, 1);
        this.spare.push(r);
      } else this.play(r, dt, now, f);
    }
    if (now <= this.talking) this.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  /** A new cue from roaming. */
  private cue(now: number, f: MapFrame): void {
    const phase = SHARE.phase;
    let c = this.cur;
    if (c && c.a.i !== SHARE.id) {
      // (someone else now: the last one finishes on its own)
      this.finish(c, now);
      c = this.cur = null;
    }
    if (!c) {
      const a = this.byIndex[SHARE.id];
      if (!a || !a.shown || phase === 'none' || phase === 'end') return;
      if (a.held) {
        // (already finishing — a child running back — it is taken on again; else someone else holds them)
        const k = this.after.findIndex((r) => r.a === a);
        if (k < 0) {
          SHARE.lost = true;
          return;
        }
        c = this.after.splice(k, 1)[0];
      } else c = this.take(a, now);
      this.cur = c;
    }
    c.phase = phase;
    // (a check that starts in the middle: that far in already)
    c.since = now - SHARE.lag;
    if (this.env.shot) console.info(`[map] share: ${phase} · ${c.kid ? 'a child' : c.elder ? 'an elder' : (c.a.look.kind ?? 'someone')} ${len(c.a.x - this.him.x, c.a.z - this.him.z).toFixed(1)} m`);
    switch (phase) {
      case 'come':
        SHARE.arrived = !c.kid;
        // (a check that starts in the middle: the child is there already)
        if (c.kid && SHARE.arrived) this.placeKid(c, SHARE.meetX, SHARE.meetZ);
        break;
      case 'hold':
        if (c.kid) this.placeKid(c, SHARE.meetX, SHARE.meetZ, true);
        break;
      case 'take':
        if (c.kid) this.placeKid(c, SHARE.meetX, SHARE.meetZ, true);
        this.wear(c, 'fruit', now);
        break;
      case 'thanks':
        if (c.kid) this.placeKid(c, SHARE.meetX, SHARE.meetZ, true);
        this.wear(c, 'fruit', now);
        this.say(c, SHARE.word as WordKey, f, c.kid ? 'kidHello' : 'hello');
        break;
      case 'back':
        this.wear(c, SHARE.back === 'snack' || SHARE.back === 'seeds' ? 'parcel' : 'fruit', now);
        if (SHARE.word2) this.say(c, SHARE.word2 as WordKey, f, null);
        break;
      case 'again':
        this.say(c, SHARE.word as WordKey, f, c.kid ? 'kidHello' : 'hello');
        this.finish(c, now);
        this.cur = null;
        break;
      case 'end':
        this.wear(c, 'fruit', now);
        this.finish(c, now);
        this.cur = null;
        break;
      case 'none':
        this.finish(c, now);
        this.cur = null;
        break;
      default:
        break;
    }
  }

  /** Hold a person for a giving. */
  private take(a: Actor, now: number): Taker {
    const r =
      this.spare.pop() ??
      ({ a, kid: false, seated: false, floor: false, elder: false, phase: 'none', since: now, hold: { at: { x: 0, y: 0, z: 0 }, nod: 0, pose: false }, yaw: 0, ox: 0, oz: 0, x: 0, z: 0, moved: false, wearing: 'none', before: null, until: Infinity } as Taker);
    r.a = a;
    r.kid = a.look.kind === 'kid';
    r.seated = SEATED.has(a.currentPose);
    r.floor = a.currentPose === POSE.sit;
    r.elder = isElder(a.look);
    r.since = now;
    r.yaw = a.yaw;
    r.ox = r.x = a.x;
    r.oz = r.z = a.z;
    // (they stay where they are while it lasts: their scene would walk them on meanwhile; a child runs where this says)
    r.moved = true;
    r.wearing = 'none';
    r.before = null;
    r.until = Infinity;
    r.hold.at.x = this.him.x;
    r.hold.at.y = this.him.y;
    r.hold.at.z = this.him.z;
    r.hold.nod = 0;
    // (standing, their own pose waits while the giving shows its own; sitting, they stay as they are)
    r.hold.pose = !r.seated;
    a.held = r.hold;
    if (r.hold.pose) a.crowd.pose(a.i, POSE.stand, now);
    return r;
  }

  /** Done with roaming's part: let go now, or after a last moment (a child runs back, a grown-up looks at it). */
  private finish(r: Taker, now: number): void {
    if (r.phase === 'none') {
      r.until = now + (r.kid && len(r.x - r.ox, r.z - r.oz) > 0.1 ? 4 : 0);
    } else if (r.phase === 'again') r.until = now + 1.8;
    else r.until = now + (r.kid ? 6 : LOOK_AT);
    if (!this.after.includes(r)) this.after.push(r);
  }

  /** Each frame: the turn, the pose of the phase, a child's run and jump. */
  private play(r: Taker, dt: number, now: number, f: MapFrame): void {
    const a = r.a;
    const u = now - r.since;
    const crowd = a.crowd;
    const h = this.him;
    r.hold.at.x = h.x;
    r.hold.at.y = h.y;
    r.hold.at.z = h.z;
    let pose: number = POSE.stand;
    let nod = 0;
    let hop = 0;
    let face = Math.atan2(h.x - a.x, h.z - a.z);
    let running = false;
    switch (r.phase) {
      case 'come':
        nod = 0.1;
        if (r.kid && !SHARE.arrived) {
          // (running up to him)
          if (this.run(r, SHARE.meetX, SHARE.meetZ, RUN, dt, now)) {
            SHARE.arrived = true;
            if (this.env.shot) console.info('[map] share: the child is before him');
          } else {
            face = r.yaw;
            running = true;
          }
        }
        break;
      case 'hold':
        pose = POSE.give;
        nod = 0.15;
        break;
      case 'take':
        pose = POSE.give;
        nod = 0.2;
        break;
      case 'thanks':
        if (r.kid) {
          pose = u < 1.5 ? POSE.cheer : POSE.stand;
          // (a jump once the arms are up)
          if (u > HOP_AT && u < HOP_AT + HOP_FOR) hop = HOP * crowd.scale(a.i) * Math.sin(((u - HOP_AT) / HOP_FOR) * Math.PI);
          nod = -0.2;
        } else if (r.elder) {
          // (an elder holds it up a moment in both hands, nodding)
          pose = u < 1.3 && !r.seated ? POSE.give : POSE.stand;
          nod = 0.35 * bump(u, 0.1, 1.3);
        } else {
          pose = u > 0.25 && u < 1.9 ? (r.seated ? POSE.kneel : POSE.sampeah) : POSE.stand;
          nod = 0.2 * bump(u, 0.25, 1.9);
        }
        break;
      case 'back':
        if (r.wearing === 'parcel') {
          pose = POSE.give;
          nod = 0.2;
          // (he has taken it: the fruit in their hands again)
          if (u > 0.95) this.wear(r, 'fruit', now);
        } else {
          // (an elder blesses him: a hand raised a little)
          pose = r.elder ? POSE.nod : POSE.stand;
          nod = 0.15;
        }
        break;
      case 'end':
        if (r.kid) {
          // (back to the others with it, held up now and then)
          if (!this.run(r, r.ox, r.oz, RUN_BACK, dt, now)) {
            face = r.yaw;
            running = true;
          } else r.until = Math.min(r.until, now + BACK_HOME);
          pose = POSE.stand;
        } else {
          // (a look at it, pleased, then it goes in their basket)
          nod = 0.45;
          r.hold.at.x = a.x + Math.sin(a.yaw) * 0.6;
          r.hold.at.y = a.y + 0.9 * (crowd.scale(a.i) / 1.4);
          r.hold.at.z = a.z + Math.cos(a.yaw) * 0.6;
        }
        break;
      case 'again':
        pose = r.kid ? POSE.wave : POSE.stand;
        nod = r.kid ? 0 : 0.3 * bump(u, 0.1, 1.2);
        break;
      case 'none':
        if (r.kid && !this.run(r, r.ox, r.oz, RUN_BACK, dt, now)) {
          face = r.yaw;
          running = true;
        }
        break;
      default:
        break;
    }
    r.hold.nod = nod;
    // Their pose (standing; sitting on the floor they come up on their knees to sampeah, then sit again).
    if (!r.seated) crowd.pose(a.i, pose as typeof POSE.stand, now);
    else if (r.floor && pose === POSE.kneel) {
      if (!r.hold.pose) {
        r.hold.pose = true;
        crowd.pose(a.i, POSE.kneel, now);
      }
    } else if (r.hold.pose) {
      a.release(now);
      r.hold.pose = false;
      a.held = r.hold;
    }
    // Turning to him (standing, not riding); a child's place and jump.
    const turns = !r.seated && !a.riding;
    if (turns) {
      r.yaw = wrap(r.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(face - r.yaw))));
      a.yaw = r.yaw;
    }
    if (r.moved) {
      a.x = r.x;
      a.z = r.z;
      // (standing still: no step, whatever their scene asks for; running: run() set it)
      if (!running) crowd.gait(a.i, 0, 0.9, now);
    }
    if (turns || r.moved || hop > 0) crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
    // (a laugh as the child jumps)
    if (r.kid && r.phase === 'thanks' && u - dt < HOP_AT && u >= HOP_AT && f.dt > 0 && !this.env.shot) f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.55 });
  }

  /** A child runs toward (x, z) at `speed`: true once there. */
  private run(r: Taker, x: number, z: number, speed: number, dt: number, now: number): boolean {
    const a = r.a;
    const dx = x - r.x;
    const dz = z - r.z;
    const d = len(dx, dz);
    const crowd = a.crowd;
    if (d < 0.08) {
      crowd.gait(a.i, 0, 0.9, now);
      return true;
    }
    r.moved = true;
    const v = Math.min(speed, d * 3 + 0.3);
    const s = Math.min(d, v * dt);
    const nx = r.x + (dx / d) * s;
    const nz = r.z + (dz / d) * s;
    const g = this.env.ground.at(nx, nz, a.y);
    // (a wall or a drop in the way: it stops there)
    if (!Number.isFinite(g) || Math.abs(g - a.y) > 0.6) {
      crowd.gait(a.i, 0, 0.9, now);
      return true;
    }
    r.x = nx;
    r.z = nz;
    a.y += (g - a.y) * Math.min(1, dt * 10);
    r.yaw = wrap(r.yaw + Math.max(-6 * dt, Math.min(6 * dt, wrap(Math.atan2(dx, dz) - r.yaw))));
    a.yaw = r.yaw;
    crowd.gait(a.i, 1, crowd.stepRate(a.i, v, 1), now);
    return false;
  }

  /** Put a child at (x, z) at once (a check in the middle of it; a child that has not come yet when he holds it out). */
  private placeKid(r: Taker, x: number, z: number, onlyIfNear = false): void {
    if (onlyIfNear && len(r.x - x, r.z - z) < 1.5) return;
    const g = this.env.ground.at(x, z, r.a.y);
    if (!Number.isFinite(g)) return;
    r.x = x;
    r.z = z;
    r.a.y = g;
    r.moved = true;
  }

  /** What they hold: the fruit, the parcel they give back, or nothing (their own look again). */
  private wear(r: Taker, what: 'none' | 'fruit' | 'parcel', now: number): void {
    if (r.wearing === what) return;
    const a = r.a;
    const crowd = a.crowd;
    r.wearing = what;
    if (what === 'none') {
      crowd.unstrike(a.i, now);
      crowd.dress(a.i, a.look);
      return;
    }
    // (their colours with the fruit's, or the parcel's, on the prop slots: a look of its own a while)
    const colors = a.look.colors.slice();
    if (what === 'fruit') {
      colors[SLOT.prop] = SHARE.fruit;
      colors[SLOT.prop2] = SHARE.stalk;
    } else {
      colors[SLOT.prop2] = SHARE.backColor;
      colors[SLOT.accent2] = SHARE.backTie;
    }
    crowd.dress(a.i, { ...a.look, colors });
    crowd.strike(a.i, what === 'fruit' ? FRUIT : PARCEL, CARRY.none, 0, now);
  }

  /** Let go: their own look, pose and carry again; a child where its scene has it next. */
  private letGo(r: Taker, now: number): void {
    const a = r.a;
    this.wear(r, 'none', now);
    if (a.held === r.hold) a.release(now);
    if (this.speaker === a && now < this.talking - 0.5) this.talking = now + 0.5;
  }

  /** Their words over their head (and their voice). */
  private say(r: Taker, key: WordKey, f: MapFrame, voice: 'hello' | 'kidHello' | null): void {
    if (!key) return;
    const a = r.a;
    this.speaker = a;
    const item = SHARE.item ? t(SHARE.item as WordKey) : '';
    const plant = SHARE.plant ? t(SHARE.plant as WordKey) : '';
    this.bubble.say(key, this.headAt, SAY, { item, plant: lang() === 'en' ? plant.toLowerCase() : plant });
    this.talking = this.lastNow + SAY + 1;
    const k = a.crowd.scale(a.i);
    if (voice && f.dt > 0 && !this.env.shot) f.calls.push({ kind: voice, x: a.x, y: a.y + 1.6 * k, z: a.z, gain: 0.8, size: 1.7 * k });
  }

  /** The people's clock at the last update (s). */
  private lastNow = 0;

  /** The finder (share.ts `ShareFinder`): the free person nearest (x, y, z) in front. */
  private find(x: number, y: number, z: number, yaw: number, range: number, cone: number, kids: boolean, skip: (id: number) => boolean, out: ShareWho): boolean {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const front = Math.cos(cone);
    const g = HOME.gran;
    let best: Actor | null = null;
    let bd = range;
    for (const a of this.actors) {
      if (!a.shown || !a.crowd.isShown(a.i) || a.riding || a.performing || (a.held && a.held !== this.cur?.hold)) continue;
      const dx = a.x - x;
      const dz = a.z - z;
      const d = len(dx, dz);
      if (d >= bd || d < 0.05 || (cone < Math.PI && (dx * fx + dz * fz) / d < front) || Math.abs(a.y - y) > LEVEL + LEVEL_SLOPE * d) continue;
      const look = a.look;
      const kind = look.kind ?? 'villager';
      const kid = kind === 'kid';
      const pose = a.currentPose;
      // (children are the children's prompt, unless sitting; grown-ups the other)
      if (kids !== (kid && !SEATED.has(pose))) continue;
      if (NOT.has(kind) || kind.startsWith('monk') || NO.has(pose) || look.carry === CARRY.kite || look.feats.some((ft) => FULL_HANDS.includes(ft)) || skip(a.i)) continue;
      // (the grandmother at her house while she gives him the key or calls him: hers, not ours)
      if (g.shown && Math.abs(a.x - g.x) < 0.05 && Math.abs(a.z - g.z) < 0.05 && g.cue !== 'idle' && g.cue !== 'call') continue;
      bd = d;
      best = a;
    }
    if (!best) return false;
    out.id = best.i;
    out.x = best.x;
    out.y = best.y;
    out.z = best.z;
    out.yaw = best.yaw;
    out.d = bd;
    out.kind = best.look.kind ?? 'villager';
    out.elder = isElder(best.look);
    out.kid = out.kind === 'kid';
    out.gran = g.shown && Math.abs(best.x - g.x) < 0.05 && Math.abs(best.z - g.z) < 0.05;
    out.seated = SEATED.has(best.currentPose);
    out.scale = best.crowd.scale(best.i);
    return true;
  }
}

/** A smooth rise and fall over [a, b] (s): 0 outside, 1 in the middle. */
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}
