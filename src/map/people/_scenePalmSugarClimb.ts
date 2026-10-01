import { PALM_CLIMB } from '../hamlet/_psPalms';
import { len2 } from '../fauna/_len';
import type { Actor } from './_actor';
import { FEAT, POSE, SLOT, type Look } from './_personModel';
import type { MapFrame, PeopleCallKind } from '../types';
import type { Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * The palm sugar family and the explorer up their ladders
 * (roam/_palmClimb.ts; what each tells the other: hamlet/_psPalms.ts
 * `PALM_CLIMB`). `_scenePalmSugar.ts` keeps one of these and asks it:
 *
 * - **the cook** (the tapper's wife): when he swaps a tube under a crown she
 *   leaves her woks for that palm's foot and waits there looking up at him;
 *   once he has stepped off with it she comes to stand before him, takes
 *   the full tube in both hands ("អរគុណណាក្មួយ!"), tucks it in her waist,
 *   holds out a cup of fresh palm juice ("ទឹកត្នោតស្រស់មួយកែវ សម្រាប់ក្មួយ!")
 *   and goes back to pour his juice into the first wok (her own `fill`: the
 *   scene's). The explorer's side draws the tube in her hands and at her
 *   waist from where she stands (`PALM_CLIMB.cook`);
 * - **the tapper**: which palm he is up or about to climb (the explorer does
 *   not climb that one); arriving at a palm the explorer is on (or at the
 *   foot of), he waits a few steps off, looking up, until it is free; up his
 *   own palm while the explorer climbs another, he calls across to him
 *   ("ប្រយ័ត្នរអិលណាក្មួយ!", and at the top "ពីលើនេះមើលឃើញឆ្ងាយណាស់ មែនទេ?");
 * - **the child** watches the explorer climb a yard palm when father is
 *   not up one.
 *
 * Shots (`PALM_CLIMB.warp`: the explorer's URL put him there) have the cook
 * there at once, and keep her words up for the picture.
 */

/** She stands this far before him for the exchange (just clear of him: the people keep that far apart), and waits this far out past where he steps off (m). */
const FACE = 1.2;
const WAIT_OUT = 1.35;
/** Her walk (m/s), as the scene's. */
const WALK = 0.9;
/** In the `give` pose her hands are this far ahead of her feet and this high (model metres, times her size); her waist on the right. */
const HANDS = { fwd: 0.4, up: 0.93 };
const HIP = { side: 0.2, up: 0.6, fwd: 0.05 };
/** The exchange's moments (s of `PALM_CLIMB.hand.t`, as roam/_palmClimb.ts `HAND`): she has the tube; tucks it; holds out the cup; he has it. */
const T = { taken: 0.95, thanks: 1.0, tuck: 1.6, cup: 1.9, gift: 1.95, got: 2.9 };
/** The tapper's calls: across this far at most (m), this long apart at least (s, the people's clock). */
const CALL_FAR = 45;
const CALL_GAP = 4;
/** She pours his tube into the first wok this long (s). */
const POUR = 3.2;
/** The colour of the juice in her cup (her parcel's, `FEAT.parcel`). */
const JUICE = 0xb08a52;

export class PsClimb {
  private job: 'none' | 'meet' | 'take' = 'none';
  private seenSwaps = PALM_CLIMB.swaps;
  private path: Point[] = [];
  private leg = 0;
  /** When he was last seen on the ladder or at its foot (the people's clock): she gives up a while after he is gone. */
  private lastSeen = 0;
  private took = false;
  private thanked = false;
  private gave = false;
  /** Her own look and the same with the cup in her hands. */
  private base: Look | null = null;
  private cupLook: Look | null = null;
  /** She is carrying his juice to the first wok (the scene's `fill`), and since when she pours it in (−1: not yet). */
  carrying = false;
  private pourFrom = -1;
  /** The tapper's last call: which climb, and when; his call at the top. */
  private calledClimb = -1;
  private calledTop = -1;
  private callAt = -1e9;
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  /** This update's frame (their voices go into its calls). */
  private f: MapFrame | null = null;

  constructor(
    private readonly env: PeopleEnv,
    private readonly way: (a: Actor, path: readonly Point[]) => Point[],
    private readonly pt: (x: number, z: number) => Point,
  ) {}

  /** Once an update while the family is about: the explorer's side knows someone is there to take a tube. */
  begin(f: MapFrame): void {
    this.f = f;
    PALM_CLIMB.seen++;
  }

  /** A voice with the words (audio/people.ts: a call across, a spoken word), heard where they are even off the screen. */
  private voice(a: Actor, kind: PeopleCallKind): void {
    const f = this.f;
    if (!f || f.dt <= 0 || this.env.shot) return;
    const k = a.crowd.scale(a.i);
    f.calls.push({ kind, x: a.x, y: a.y + 1.6 * k, z: a.z, gain: 0.9, size: 1.7 * k });
  }

  // ── The tapper ───────────────────────────────────────────────────────────

  /** The palm he is up or about to climb (null: none), and whether he is up one now. */
  tapper(palm: string | null, up: boolean): void {
    PALM_CLIMB.tapperPalm = palm;
    PALM_CLIMB.tapperUp = up;
  }

  /** Is the explorer on palm `id`, or at its foot (the tapper's spot to climb from, (x, z))? */
  blocks(id: string, x: number, z: number, ex: Point | null): boolean {
    const h = PALM_CLIMB;
    if (h.palm === id) return true;
    if (h.hand.on && len2(h.hand.x - x, h.hand.z - z) < 2.6) return true;
    return !!ex && len2(ex.x - x, ex.z - z) < 1.6;
  }

  /** Where the tapper waits for the explorer to be off his palm: out from its foot and a little aside. */
  waitSpot(px: number, pz: number, lx: number, lz: number): Point {
    return this.pt(px + lx * 2.6 - lz * 1.3, pz + lz * 2.6 + lx * 1.3);
  }

  /** The explorer's head, for those looking up at him. */
  exHead(): Point {
    const h = PALM_CLIMB.head;
    this.look.x = h.x;
    this.look.y = h.y;
    this.look.z = h.z;
    return this.look;
  }

  /**
   * The tapper calls across to the explorer: while he climbs (once a climb),
   * when he is at the top (once a climb). `up`: the tapper is on a ladder, or
   * waiting at the foot of the explorer's.
   */
  calls(a: Actor, up: boolean, now: number): void {
    const h = PALM_CLIMB;
    if (!up || !h.palm || !a.shown || len2(a.x - h.head.x, a.z - h.head.z) > CALL_FAR) return;
    if (now - this.callAt < CALL_GAP) return;
    const say = (key: 'palmCallUp' | 'palmCallTop') => {
      this.callAt = now;
      this.voice(a, 'vendorCall');
      this.env.bubble.say(key, () => {
        this.head.x = a.x;
        this.head.y = a.y + 2.3 * (a.crowd.scale(a.i) / 1.4);
        this.head.z = a.z;
        return this.head;
      }, 3.6);
    };
    if (h.climbs !== this.calledClimb && h.s > 2) {
      this.calledClimb = h.climbs;
      say('palmCallUp');
    } else if (h.top && h.climbs !== this.calledTop && this.calledClimb === h.climbs) {
      this.calledTop = h.climbs;
      say('palmCallTop');
    }
  }

  // ── The cook ─────────────────────────────────────────────────────────────

  /**
   * One step of the cook for the explorer's tube: 'busy' while she is at it
   * (the scene leaves her be), 'fill' once she has it (the scene sends her to
   * pour it into the first wok: `carrying` until that is done), 'resume' when
   * he went without handing it over (back to her work), else null. `away`:
   * she is not out (at home, on the house's stair, not down yet).
   */
  cook(a: Actor, dt: number, now: number, away: boolean): 'busy' | 'fill' | 'resume' | null {
    const h = PALM_CLIMB;
    if (h.swaps !== this.seenSwaps) {
      this.seenSwaps = h.swaps;
      if (!away && a.shown && this.job === 'none') {
        this.job = 'meet';
        this.lastSeen = now;
        this.took = this.thanked = this.gave = false;
        this.base = a.look;
        const s = h.stand;
        const spot = this.pt(s.x + s.ox * WAIT_OUT, s.z + s.oz * WAIT_OUT);
        this.path = h.warp ? [spot] : this.way(a, [spot]);
        this.leg = 0;
        if (h.warp) a.warp(spot.x, spot.y, spot.z, Math.atan2(-s.ox, -s.oz));
      }
    }
    if (this.job === 'none') {
      // (carrying his juice to the wok: `pouring` says where she is)
      if (!this.carrying) this.publish(a, 'none');
      return null;
    }
    if (h.palm || h.hand.on) this.lastSeen = now;
    // He left (back to the map) without handing it over: back to her work.
    else if (now - this.lastSeen > 2.5) return this.end(a, false);
    if (this.job === 'meet' && h.hand.on) {
      // Off the ladder with it: she comes to stand before him.
      this.job = 'take';
      this.leg = 0;
      this.path = [this.before(a)];
      if (h.warp) {
        const p = this.path[0];
        a.warp(p.x, p.y, p.z, Math.atan2(h.hand.x - p.x, h.hand.z - p.z));
      }
    }
    if (this.job === 'meet') {
      const there = this.walk(a);
      if (there) {
        // At the foot of his palm: turned to it, looking up at him.
        a.face(Math.atan2(-h.stand.ox, -h.stand.oz));
        a.lookAt(this.exHead(), now + 0.5);
      }
      a.pose(POSE.stand, now);
      a.step(dt, now);
      this.publish(a, there ? 'waiting' : 'coming');
      return 'busy';
    }
    // Taking it: before him (following him if he moved), then the exchange as his side runs it.
    const t = h.hand.t;
    if (t < 0) this.path[0] = this.before(a);
    const there = this.walk(a);
    const yaw = Math.atan2(h.hand.x - a.x, h.hand.z - a.z);
    if (there) a.face(yaw);
    this.head.x = h.hand.x;
    this.head.y = h.hand.y + 2.0;
    this.head.z = h.hand.z;
    a.lookAt(this.head, now + 0.5);
    const cup = t >= T.cup && t < T.got;
    this.dress(a, cup);
    a.pose(t >= 0 && (t < T.tuck || cup) ? POSE.give : POSE.stand, now);
    a.step(dt, now);
    if (t >= T.taken) this.took = true;
    // (a shot keeps her words up for the picture)
    if (t >= T.thanks && t < T.cup && (!this.thanked || h.warp)) {
      this.thanked = true;
      this.say(a, 'palmThanks');
    }
    if (t >= T.gift && t < T.got + 1 && (!this.gave || h.warp)) {
      this.gave = true;
      this.say(a, 'palmGift');
    }
    this.publish(a, there || t >= 0 ? 'ready' : 'coming');
    if (!h.hand.on && t >= 0) return this.end(a, this.took);
    return 'busy';
  }

  /** Done with him: his juice to the first wok (`took`), else back to her work. */
  private end(a: Actor, took: boolean): 'fill' | 'resume' {
    this.job = 'none';
    this.dress(a, false);
    a.lookAt(null);
    this.carrying = took;
    this.pourFrom = -1;
    PALM_CLIMB.warp = false;
    this.publish(a, took ? 'back' : 'none');
    return took ? 'fill' : 'resume';
  }

  /**
   * The scene's `fill` with his juice: on her way ('back'), pouring it into the wok for `POUR` s once there ('pour'),
   * then done (`carrying` off). True while she is at it (the scene keeps her on the job however long the walk was).
   */
  pouring(a: Actor, filling: boolean, there: boolean, now: number): boolean {
    if (!this.carrying) return false;
    if (filling && there && this.pourFrom < 0) this.pourFrom = now;
    if (!filling || (this.pourFrom >= 0 && now - this.pourFrom > POUR)) {
      this.carrying = false;
      this.pourFrom = -1;
      this.publish(a, 'none');
      return false;
    }
    this.publish(a, this.pourFrom >= 0 ? 'pour' : 'back');
    return true;
  }

  /** Where she stands before him (from the side she comes from): a kept point. */
  private readonly spot: Point = { x: 0, y: 0, z: 0 };
  private before(a: Actor): Point {
    const h = PALM_CLIMB.hand;
    let dx = a.x - h.x;
    let dz = a.z - h.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) {
      dx = PALM_CLIMB.stand.ox;
      dz = PALM_CLIMB.stand.oz;
    } else {
      dx /= l;
      dz /= l;
    }
    const p = this.spot;
    p.x = h.x + dx * FACE;
    p.z = h.z + dz * FACE;
    p.y = this.env.ground.field.heightAt(p.x, p.z);
    return p;
  }

  /** Walk her path; true once at its end. */
  private walk(a: Actor): boolean {
    if (this.leg >= this.path.length) return true;
    const g = this.path[this.leg];
    a.goTo(g.x, g.z, WALK);
    a.face(null);
    if (a.dist(g.x, g.z) < (this.leg === this.path.length - 1 ? 0.12 : 0.3)) this.leg++;
    return this.leg >= this.path.length;
  }

  /** The cup in her hands (her parcel, the juice's colour) or her own look. */
  private dress(a: Actor, cup: boolean): void {
    const base = this.base ?? a.look;
    this.base = base;
    if (cup && !this.cupLook) {
      const colors = base.colors.slice();
      colors[SLOT.prop2] = JUICE;
      this.cupLook = { ...base, colors, feats: [...base.feats, FEAT.parcel] };
    }
    const want = cup ? this.cupLook! : base;
    if (a.look === want) return;
    a.look = want;
    a.crowd.dress(a.i, want);
  }

  private say(a: Actor, key: 'palmThanks' | 'palmGift'): void {
    if (!PALM_CLIMB.warp) this.voice(a, 'hello');
    this.env.bubble.say(key, () => {
      this.head.x = a.x;
      this.head.y = a.y + 2.3 * (a.crowd.scale(a.i) / 1.4);
      this.head.z = a.z;
      return this.head;
    }, 2.6);
  }

  /** Where she is for the explorer's side (the tube is drawn in her hands, at her waist). */
  private publish(a: Actor, state: typeof PALM_CLIMB.cook.state): void {
    const c = PALM_CLIMB.cook;
    c.state = state;
    if (state === 'none') return;
    const k = a.crowd.scale(a.i);
    const sx = Math.sin(a.yaw);
    const cz = Math.cos(a.yaw);
    c.x = a.x;
    c.y = a.y;
    c.z = a.z;
    c.yaw = a.yaw;
    c.hands.x = a.x + sx * HANDS.fwd * k;
    c.hands.y = a.y + HANDS.up * k;
    c.hands.z = a.z + cz * HANDS.fwd * k;
    // (her right: −(cos, −sin) of her heading)
    c.hip.x = a.x - cz * HIP.side * k + sx * HIP.fwd * k;
    c.hip.y = a.y + HIP.up * k;
    c.hip.z = a.z + sx * HIP.side * k + cz * HIP.fwd * k;
  }
}
