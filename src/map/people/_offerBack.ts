import { DAK } from '../roam/_dakBatHooks';
import { OFFER, OFFER_CONE, OFFER_NEAR } from '../roam/_offerFruitHooks';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { wrap, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { FEAT, POSE, type Pose } from './_personModel';
import { len, type Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * A monk takes the fruit the explorer offers him on the way (index.ts: `update`
 * once a frame, after the scenes and the greetings; the explorer's side:
 * roam/_offerFruitMonk.ts; the link: roam/_offerFruitHooks.ts `OFFER`). The
 * monk nearest in front of him, standing or walking (not seated in a row, on
 * his dais or at a meal, not riding, not one on his alms round with his bowl:
 * the dak bat's), stops where he is and turns to him:
 *
 * - `there`: he waits, looking at him;
 * - `take`: he holds out both hands and takes the fruit (`POSE.give`: both hands
 *   out together, the head bowed a little);
 * - `bless`: his right hand raised a little in blessing (`POSE.nod`), he chants
 *   the thanks for a gift, "♪ យថា វារិវហា បូរា បរិបូរេន្តិ សាគរំ", and the four
 *   blessings, "♪ អាយុ វណ្ណោ សុខំ ពលំ" (bubbles, the Pali in Khmer letters);
 * - `again` (he had fruit from him today already): a smile and a nod, "ញោមបាន
 *   ប្រគេនអាត្មារួចហើយថ្ងៃនេះ សាធុ!", nothing taken.
 *
 * Then the scene's own pose and way again (`Actor.held` / `release`). It also
 * lends roaming the finder of a monk who would take it (`OFFER.find`), so the
 * prompt shows only before one. Nothing runs between offerings.
 */

/** Not offered to while in these poses (seated, chanting, blessing, at work, riding). */
const BUSY: ReadonlySet<number> = new Set<number>([POSE.sit, POSE.kneel, POSE.chant, POSE.bless, POSE.stool, POSE.eat, POSE.squat, POSE.ride, POSE.hammock, POSE.row, POSE.climb]);
/** On about his floor (m). */
const LEVEL = 1.6;
/** Turning to him (radians a second). */
const TURN = 3.0;
/** His eyes over his feet (m, the roaming explorer). */
const EYE = 2.0;
/** Where his hands meet in `POSE.give`, held out (model m from his feet, +z ahead: times his scale). */
const HANDS = { y: 0.83, z: 0.46 } as const;
/** Held no longer than this (s): roaming lets go before. */
const HOLD_MAX = 30;
const SMILE = [FEAT.grin] as const;

export class OfferBack {
  private m: Actor | null = null;
  private n = 0;
  private x = 0;
  private z = 0;
  private yaw = 0;
  private since = 0;
  private shown: string = '';
  private struck = false;
  private readonly hold = { at: { x: 0, y: 0, z: 0 } as Point, nod: 0, pose: true };
  private readonly bubble = new Bubble();
  private talking = -1e9;
  private hush = false;
  private said: WordKey | null = null;
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => {
    const a = this.m;
    if (a) {
      this.head.x = a.x;
      this.head.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4);
      this.head.z = a.z;
    }
    return this.head;
  };

  constructor(
    private readonly env: PeopleEnv,
    private readonly actors: readonly Actor[],
  ) {
    OFFER.find = (x, y, z, yaw) => this.find(x, y, z, yaw)?.i ?? -1;
  }

  /** Once a frame, after the scenes' steps and the greetings (`now`: the people's clock). */
  update(dt: number, now: number, f: MapFrame): void {
    const a = OFFER.ask;
    if (a.state === 'ask' && a.answered !== a.n) this.answer(now);
    if (this.m) this.keep(dt, now);
    if (this.hush) {
      // (let go: his words gone at once)
      this.hush = false;
      this.bubble.update(0, f.camera, false);
    } else if (now <= this.talking) this.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  /** A new asking: the monk in front of him, if any, stops for him. */
  private answer(now: number): void {
    const a = OFFER.ask;
    this.letGo(now);
    a.answered = a.n;
    const m = this.find(a.x, a.y, a.z, a.yaw);
    a.i = m ? m.i : -1;
    if (!m) {
      if (this.env.shot) console.info(`[map] offer: nobody to take it at (${a.x.toFixed(1)}, ${a.z.toFixed(1)})`);
      return;
    }
    this.m = m;
    this.n = a.n;
    this.x = m.x;
    this.z = m.z;
    this.yaw = m.yaw;
    this.since = 0;
    this.shown = '';
    this.said = null;
    a.again = OFFER.given.get(m.i) === Math.floor(TIME.days());
    m.held = this.hold;
    this.hold.pose = true;
    m.crowd.pose(m.i, POSE.stand, now);
    this.write();
    if (this.env.shot) console.info(`[map] offer: a monk ${len(m.x - a.x, m.z - a.z).toFixed(1)} m off stops for him${a.again ? ' (given today already)' : ''}`);
  }

  /** Each frame while he is held: stopped, turned to him, the pose and the words of the moment. */
  private keep(dt: number, now: number): void {
    const a = OFFER.ask;
    const m = this.m!;
    this.since += dt;
    if (a.n !== this.n || a.state === 'none' || a.state === 'done' || !m.shown || this.since > HOLD_MAX) {
      this.letGo(now);
      return;
    }
    // (the scene walks him on underneath: he stays where he stopped, his legs still)
    m.x = this.x;
    m.z = this.z;
    m.speed = 0;
    m.crowd.gait(m.i, 0, 0.9, now);
    const ex = this.env.traffic.explorer;
    const px = ex ? ex.x : a.x;
    const pz = ex ? ex.z : a.z;
    const want = Math.atan2(px - m.x, pz - m.z);
    this.yaw = wrap(this.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - this.yaw))));
    m.yaw = this.yaw;
    m.crowd.place(m.i, m.x, m.y, m.z, m.yaw);
    const h = this.hold;
    h.at.x = px;
    h.at.y = (ex ? ex.y : a.y) + EYE;
    h.at.z = pz;
    if (m.held !== h) m.held = h;
    // The pose and the words of the moment (each once as its step begins).
    const step = a.state;
    if (step !== this.shown) {
      this.shown = step;
      const pose: Pose = step === 'take' ? POSE.give : step === 'bless' || step === 'again' ? POSE.nod : POSE.stand;
      m.crowd.pose(m.i, pose, now);
      if (step === 'again' && !this.struck) {
        m.crowd.strike(m.i, SMILE, null, 0, now);
        this.struck = true;
      }
    }
    h.nod = step === 'take' ? 0.2 : step === 'bless' ? 0.15 : step === 'again' ? 0.3 * Math.max(0, Math.sin(Math.min(1, a.t / 1.4) * Math.PI)) : 0;
    if (step === 'bless') {
      this.say('offerAnumodana', a.t, 0.2, 2.9, now);
      this.say('offerFourBless', a.t, 3.2, 2.3, now);
    } else if (step === 'again') this.say('offerMonkAgain', a.t, 0.3, 2.8, now);
    this.write();
  }

  /** His words over his head from `at` s into the step for `len` s (said once). */
  private say(key: WordKey, t: number, at: number, len: number, now: number): void {
    if (t < at || t > at + len || this.said === key) return;
    this.said = key;
    this.bubble.say(key, this.headAt, at + len - t);
    this.talking = now + at + len - t + 1;
  }

  /** Where he stands and where his hands meet (for roaming). */
  private write(): void {
    const a = OFFER.ask;
    const m = this.m!;
    const k = m.crowd.scale(m.i);
    a.mx = m.x;
    a.my = m.y;
    a.mz = m.z;
    a.myaw = m.yaw;
    a.hx = m.x + Math.sin(m.yaw) * HANDS.z * k;
    a.hy = m.y + HANDS.y * k;
    a.hz = m.z + Math.cos(m.yaw) * HANDS.z * k;
  }

  /** He lets go: the scene's own pose and way again, his smile gone, his words with it. */
  private letGo(now: number): void {
    const m = this.m;
    this.m = null;
    if (!m) return;
    if (this.struck) {
      m.crowd.unstrike(m.i, now);
      this.struck = false;
    }
    if (m.held === this.hold) m.release(now);
    // (his words go with him: never left on the screen)
    if (this.talking > now) {
      this.talking = -1e9;
      this.hush = true;
    }
  }

  /** The monk nearest in front of (x, y, z) facing `yaw` who would take a gift (or null). */
  private find(x: number, y: number, z: number, yaw: number): Actor | null {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const front = Math.cos(OFFER_CONE);
    let best: Actor | null = null;
    let bd = OFFER_NEAR;
    for (const a of this.actors) {
      if (!a.shown || a.look.kind !== 'monk' || a.riding || a.performing || !a.crowd.isShown(a.i) || Math.abs(a.y - y) > LEVEL) continue;
      const dx = a.x - x;
      const dz = a.z - z;
      const d = len(dx, dz);
      if (d >= bd || d < 0.3 || (dx * fx + dz * fz) / d < front) continue;
      if (BUSY.has(a.currentPose) || (a.held && a.held !== this.hold) || this.onRound(a)) continue;
      bd = d;
      best = a;
    }
    return best;
  }

  /** On his alms round with his bowl now (the dak bat's: the explorer kneels by the way for him there). */
  private onRound(a: Actor): boolean {
    for (const s of DAK.monks) if (s.on && s.t > DAK.now - 0.6 && len(s.x - a.x, s.z - a.z) < 0.6) return true;
    return false;
  }
}
