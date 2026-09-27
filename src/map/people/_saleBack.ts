import { BROWSE, SALE } from '../shop';
import type { MapFrame } from '../types';
import { wrap, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { FEAT, POSE, type Look } from './_personModel';
import { len, type Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * The seller at a stall serves the roaming explorer (index.ts: `update` once
 * a frame, after the greetings back; the explorer's side: roam/_shop.ts,
 * the shops: shop.ts). Whoever sells there (a seller, kind `vendor`, first;
 * else the grown-up nearest behind the counter):
 *
 * - **he opens the buy menu** (`BROWSE`): she looks up at him and asks
 *   "ទិញអីដែរ បង?" / "What would you like?" (a bubble, a voice), and keeps
 *   her eyes on him while he chooses (her hands go on with their work: the
 *   scene's pose is kept);
 * - **he pays** (`SALE`): she turns to him, holds out what he bought in
 *   both hands with a little bow (`POSE.give`, the `parcel` in her hands —
 *   worn for the moment by those who have none of their own) and says
 *   "អរគុណបង!" / "Thank you!"; after ≈ 2.4 s the scene's own pose comes
 *   back (`Actor.held` / `release`: the scene runs on underneath) and it
 *   turns her back its way.
 *
 * Someone the greetings hold (people/_greetBack.ts) is waited for. One
 * seller at a time; nothing runs between sales. Shots log
 * `[map] sale: …` (who serves, how far).
 */

/** She is looked for this far in front of where the buyer stands (m, the way he faces), within `FIND` m of there. */
const AHEAD = 1.6;
const FIND = 4.5;
/** On about his floor: this far up or down (m: a seller on the hall's platform). */
const LEVEL = 2.5;
/** After his payment: she turns to him, holds it out from `GIVE[0]` to `GIVE[1]` s; her thanks from `THANKS` s. */
const GIVE = [0.25, 2.6] as const;
const THANKS = 0.45;
/** Waiting this long at most (s) for the greetings to let her go. */
const WAIT = 3;
/** Turning to him (radians a second). */
const TURN = 3.2;
/** His eyes over his feet (m, the roaming explorer). */
const EYE = 2.0;
/** Her bubble's words stay this long (s). */
const SAY = 2.4;

export class SaleBack {
  private seenSale = 0;
  private seenBrowse = 0;
  /** The seller serving him now, the shop, and her hold (her head on him; `pose`: the give shown over the scene's). */
  private a: Actor | null = null;
  private shop = '';
  private readonly hold = { at: { x: 0, y: 0, z: 0 } as Point, nod: 0, pose: false };
  /** Where the buyer stands at the shop, and the way he faces (null: not known, a sale without the menu). */
  private readonly spot = { x: 0, y: 0, z: 0 };
  private facing: number | null = null;
  /** He is at its menu; a sale waits for its seller until then (the people's clock: she may still be walking in); the next look for her. */
  private browsing = false;
  private waitGive = -1e9;
  private retry = 0;
  /** She gives from / to (the people's clock); her thanks said. */
  private giveFrom = -1e9;
  private giveTo = -1e9;
  private thanked = true;
  /** The way she faces (turning to him). */
  private yaw = 0;
  /** Her look before the parcel was put in her hands (null: she has her own). */
  private before: Look | null = null;
  private readonly bubble = new Bubble();
  private talking = -1e9;
  private readonly head: Point = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => {
    const a = this.a;
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
  ) {}

  /** Once a frame, after the scenes' steps and the greetings (`now`: the people's clock). */
  update(dt: number, now: number, f: MapFrame): void {
    const ex = this.env.traffic.explorer;
    // (answered while he is on foot among them: a shot's warm-up runs without him first)
    if (ex) {
      if (BROWSE.n !== this.seenBrowse) {
        this.seenBrowse = BROWSE.n;
        this.browse(now, f);
      }
      if (SALE.n !== this.seenSale) {
        this.seenSale = SALE.n;
        this.sale(now, f);
      }
      // (nobody there yet — she may be walking in with her basket: look again now and then while he waits)
      if (!this.a && (this.browsing || now < this.waitGive) && now >= this.retry) this.attend(now, f);
    }
    if (this.a) this.serve(dt, now, f);
    if (now <= this.talking) this.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  /** He opened the buy menu at a shop (or shut it): she looks up and asks. */
  private browse(now: number, f: MapFrame): void {
    this.browsing = !!BROWSE.shop;
    if (!this.browsing) return;
    if (BROWSE.shop !== this.shop) {
      this.letGo(now);
      this.waitGive = -1e9;
    }
    this.shop = BROWSE.shop;
    this.spot.x = BROWSE.x;
    this.spot.y = BROWSE.y;
    this.spot.z = BROWSE.z;
    this.facing = BROWSE.facing;
    if (!this.a) this.attend(now, f);
  }

  /** He paid: she turns to him and holds it out, and thanks him. */
  private sale(now: number, f: MapFrame): void {
    if (SALE.shop !== this.shop) {
      // (a sale with no menu first: look round the shop's spot)
      this.letGo(now);
      this.shop = SALE.shop;
      this.spot.x = SALE.x;
      this.spot.y = SALE.y;
      this.spot.z = SALE.z;
      this.facing = BROWSE.shop === SALE.shop ? BROWSE.facing : null;
    }
    this.waitGive = now + WAIT;
    if (this.a) this.give(now);
    else this.attend(now, f);
  }

  /** Look for the one who sells at the shop; found, she looks up (and asks, at his menu), or gives what he paid for. */
  private attend(now: number, f: MapFrame): void {
    this.retry = now + 0.25;
    const a = this.find(this.spot.x, this.spot.y, this.spot.z, this.facing);
    if (!a) return;
    this.a = a;
    this.yaw = a.yaw;
    if (this.env.shot) console.info(`[map] sale: at ${this.shop} ${a.look.kind ?? 'someone'} ${len(a.x - this.spot.x, a.z - this.spot.z).toFixed(1)} m from the buyer serves him`);
    if (now < this.waitGive) this.give(now);
    else this.say('byAsk', now, f, 0.3);
  }

  /** The give (and the thanks) from now. */
  private give(now: number): void {
    if (this.env.shot && this.a) console.info(`[map] sale: at ${this.shop} ${this.a.look.kind ?? 'someone'} hands over ${SALE.item}`);
    this.waitGive = -1e9;
    this.giveFrom = now + GIVE[0];
    this.giveTo = now + GIVE[1];
    this.thanked = false;
  }

  /** Each frame while she serves: her eyes on him, the turn, the give, then back to the scene. */
  private serve(dt: number, now: number, f: MapFrame): void {
    const a = this.a!;
    const giving = now < this.giveTo;
    if (!a.shown || (!this.browsing && !giving)) {
      this.letGo(now);
      return;
    }
    // (the greetings hold her: wait for them, the give put off a little, not for ever)
    if (a.held && a.held !== this.hold) {
      if (giving && now - (this.giveFrom - GIVE[0]) < WAIT) {
        this.giveFrom += dt;
        this.giveTo += dt;
      }
      return;
    }
    const ex = this.env.traffic.explorer;
    const h = this.hold;
    h.at.x = ex ? ex.x : BROWSE.x;
    h.at.y = (ex ? ex.y : BROWSE.y) + EYE;
    h.at.z = ex ? ex.z : BROWSE.z;
    if (!a.held) {
      h.pose = false;
      a.held = h;
      this.yaw = a.yaw;
    }
    // The give: both hands out with the parcel, a little bow; then the scene's pose again (still looking at him while he chooses).
    const give = now >= this.giveFrom && now < this.giveTo;
    if (give && !h.pose) {
      h.pose = true;
      if (!a.look.feats.includes(FEAT.parcel)) {
        this.before = a.look;
        a.crowd.dress(a.i, { ...a.look, feats: [...a.look.feats, FEAT.parcel] });
      }
      a.crowd.pose(a.i, POSE.give, now);
    } else if (!give && h.pose) {
      this.undress();
      a.release(now);
      h.pose = false;
      a.held = h;
    }
    h.nod = give ? 0.25 * bump(now - this.giveFrom, 0.1, 1.1) : 0;
    if (!this.thanked && now >= this.giveFrom - GIVE[0] + THANKS) {
      this.thanked = true;
      this.say('byThanks', now, f, 0);
    }
    // Turning to him (not on a boat or a cart); the scene turns her back after.
    if (!a.riding && (give || now < this.giveFrom)) {
      const want = Math.atan2(h.at.x - a.x, h.at.z - a.z);
      this.yaw = wrap(this.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - this.yaw))));
      a.yaw = this.yaw;
      a.crowd.place(a.i, a.x, a.y, a.z, a.yaw);
    }
  }

  /** She lets go of him: the scene's own pose and look again. */
  private letGo(now: number): void {
    const a = this.a;
    this.a = null;
    this.giveTo = -1e9;
    if (!a) return;
    if (a.held === this.hold) {
      this.undress(a);
      a.release(now);
    }
    this.hold.pose = false;
  }

  /** The parcel put in her hands goes (her own look again, unless her scene dressed her meanwhile). */
  private undress(a: Actor | null = this.a): void {
    if (!this.before || !a) return;
    a.crowd.dress(a.i, a.look);
    this.before = null;
  }

  /** Her words over her head (and her voice), `delay` s from now. */
  private say(key: 'byAsk' | 'byThanks', now: number, f: MapFrame, delay: number): void {
    const a = this.a;
    if (!a) return;
    this.bubble.say(key, this.headAt, SAY + delay);
    this.talking = now + SAY + delay + 1;
    const k = a.crowd.scale(a.i);
    // (asking: a seller's call; thanking: a spoken hello's voice — audio/people.ts)
    if (f.dt > 0 && !this.env.shot) f.calls.push({ kind: key === 'byAsk' ? 'vendorCall' : 'hello', x: a.x, y: a.y + 1.6 * k, z: a.z, gain: 0.8, size: 1.7 * k });
  }

  /**
   * Who sells at a shop whose buyer stands at (x, y, z) facing `facing`
   * (null: any way): the nearest shown grown-up round the point `AHEAD` m in
   * front of him, a seller first (not a monk, a child or a visitor).
   */
  private find(x: number, y: number, z: number, facing: number | null): Actor | null {
    const px = facing === null ? x : x + Math.sin(facing) * AHEAD;
    const pz = facing === null ? z : z + Math.cos(facing) * AHEAD;
    let best: Actor | null = null;
    let score = Infinity;
    for (const a of this.actors) {
      if (!a.shown || !a.crowd.isShown(a.i) || Math.abs(a.y - y) > LEVEL) continue;
      const kind = a.look.kind ?? 'villager';
      if (kind === 'monk' || kind === 'kid' || kind === 'visitor' || kind === 'dancer') continue;
      const d = len(a.x - px, a.z - pz);
      if (d > FIND + (facing === null ? 1 : 0)) continue;
      const s = d - (kind === 'vendor' ? 1.5 : 0) + (a.speed > 0.4 ? 2 : 0);
      if (s < score) {
        score = s;
        best = a;
      }
    }
    return best;
  }
}

/** A smooth rise and fall over [a, b] (s): 0 outside, 1 in the middle. */
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}
