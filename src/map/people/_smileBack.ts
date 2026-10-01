import { hash3 } from '../../voxel/random';
import { LENS } from '../smile';
import type { MapFrame } from '../types';
import { wrap, type Actor } from './_actor';
import { isElder } from './_greetBack';
import { CARRY, FEAT, POSE, type Carry, type Feature, type Look, type Pose } from './_personModel';
import { len, type Point } from './_routes';
import type { PeopleEnv } from './_scene';

/**
 * People smile for his camera (index.ts: `update` once a frame, after the
 * greetings). While his camera or his selfie phone is up (map/smile.ts
 * `LENS`, from roam/_smile.ts), the people in the picture — in its view,
 * within 25 m of him, on about his level, the nearest six — notice it, each
 * after a moment of their own (0.3–1.2 s), turn to it and pose their way:
 *
 * - **children**: a peace sign by the cheek (`CARRY.peace`, two fingers up:
 *   `FEAT.vee`), or they jump and wave, or jump with both arms up (`cheer`);
 *   in a selfie mostly a wave (photobombing him);
 * - **grown-ups** (villagers, sellers, fishermen, the guide…): a big smile
 *   (`FEAT.grin`), some sampeah, some wave; **elders** (grey hair) smile and
 *   nod, some sampeah;
 * - **visitors**: a wave or a thumbs-up (`CARRY.thumb`, `FEAT.thumb`), and
 *   some with a camera or a phone take his photo back (`POSE.photo`);
 * - **monks** stand calm, the hands together before them (the alms bowl's
 *   hold, with or without the bowl), a small nod, no grin;
 * - **at work** (sweeping, cooking, planting, a load on the head, a tray, a
 *   kite's string…), **sitting**, **riding** (a boat, the cart) or **walking
 *   by**: they keep at it, only look up at the camera and smile (a child
 *   walking by waves on the move); walking monks and monks sitting keep
 *   their calm.
 *
 * Not at all: whoever cannot stop — the apsara dancers and the musicians at
 * their show (`Actor.performing`), rowers, a net mid-throw, someone on a
 * bicycle, up a ladder or a palm, praying (kneeling, palms together at a shrine), handing alms to
 * a monk —, and whoever has their back to it (unless close by and free to
 * turn round).
 *
 * They hold it while the camera stays on them; a moment after it is
 * lowered or turned away, or after the shutter (`LENS.shots`), they go back
 * to what they did (`Actor.held` / `release`: the scene runs on underneath;
 * the gesture's arm comes down first, `Crowd.strike` / `unstrike`). After a
 * photo they pose again only some seconds later, and at most 20 s on end.
 * A child laughs as it starts to jump, and again at the shutter.
 *
 * Cost: nothing while the camera is down and nobody poses; up, one pass
 * over the people a frame (a few µs). No allocation a frame.
 *
 * URL (checks, with roam/_smile.ts): `smile=1` (the camera up counts at
 * once), `smile=<how>` (everyone who can poses that way: `peace`, `thumb`,
 * `wave`, `cheer`, `sampeah`, `smile`, `nod`, `photo`, `look`; monks keep
 * theirs), `smile=0` (off). A shot prints who poses, how, how far.
 */

/** How far from him (m) people can pose, and how many at once (the nearest). */
const RANGE = 25;
const MAX = 6;
/** On about his level: this far up or down (m), and this much more a metre away. */
const LEVEL = 2.5;
const LEVEL_SLOPE = 0.2;
/** In the picture: the middle of the body within this share of the frame from its centre (to start), and to stay (a little past its edge). */
const IN = 0.92;
const STAY = 1.15;
/** Nearer the lens than this (m): not in the picture (under his feet, behind the phone). */
const NEAR = 0.8;
/** The body's middle over the feet (model metres: times their size). */
const MID = 0.8;
/** They see the camera within this far round from their facing (radians), or, free to turn round, closer than `NOTICE` (m); a monk only before him. */
const SEE = 1.9;
const NOTICE = 5;
const SEE_MONK = 1.2;
/** Each notices after a moment of their own (s). */
const NOTICE_T = [0.3, 1.2] as const;
/** They let go this long after the camera is lowered (s), after it turns away (out of the picture for `AWAY` s, then), after the shutter. */
const DOWN = [0.3, 0.8] as const;
const AWAY = 0.5;
const AWAY_GO = [0.15, 0.5] as const;
const AFTER_SHOT = [0.9, 1.5] as const;
/** At most this long posing (s): then back to what they did. */
const MAX_HOLD = 20;
/** Not again for this long (s): after a photo (or their longest), and after the camera went or turned away. */
const AGAIN = 5;
const AGAIN_SHORT = 1.2;
/** After a photo nobody new starts to pose for this long (s): the picture is taken, everyone eases off a moment. */
const QUIET = 3;
/** A gesture's arm comes down in this long (s: the crowd's carry ease) before their own look is back. */
const ARM_DOWN = 0.6;
/** Turning to the camera (radians a second); faster than this (m/s) they are walking; their scene takes them this far (m) from where they stood: they go on their way. */
const TURN = 3.2;
const WALKING = 0.3;
const OFF_SPOT = 1.5;
/** His eyes over his feet (m): a visitor's camera aims there. */
const EYE = 2.0;
/** A child's hops as it starts (s each, how many, how high: model metres). */
const HOP = 0.55;
const HOPS = 3;
const HOP_H = 0.16;
/** A child's laugh: not again within this long (s). */
const LAUGH_AGAIN = 2.5;

/** How they pose. */
type How = 'peace' | 'thumb' | 'wave' | 'cheer' | 'sampeah' | 'smile' | 'nod' | 'calm' | 'photo' | 'look';
const HOWS: readonly How[] = ['peace', 'thumb', 'wave', 'cheer', 'sampeah', 'smile', 'nod', 'calm', 'photo', 'look'];

/** The whole-body pose of each (null: the scene's own, only the head turns), its carry style (a hand's gesture) and what shows on them. */
const NONE: readonly Feature[] = [];
const GRIN: readonly Feature[] = [FEAT.grin];
const WAY: Record<How, { pose: Pose | null; style: Carry | null; feats: readonly Feature[] }> = {
  peace: { pose: POSE.stand, style: CARRY.peace, feats: [FEAT.grin, FEAT.vee] },
  thumb: { pose: POSE.stand, style: CARRY.thumb, feats: [FEAT.grin, FEAT.thumb] },
  wave: { pose: POSE.wave, style: null, feats: GRIN },
  cheer: { pose: POSE.cheer, style: null, feats: GRIN },
  sampeah: { pose: POSE.sampeah, style: null, feats: GRIN },
  smile: { pose: POSE.stand, style: null, feats: GRIN },
  nod: { pose: POSE.stand, style: null, feats: GRIN },
  // (the alms bowl's hold: the hands together before the belly; only for a monk with the bowl or nothing in his hands)
  calm: { pose: POSE.stand, style: CARRY.bowl, feats: NONE },
  photo: { pose: POSE.photo, style: null, feats: NONE },
  look: { pose: null, style: null, feats: GRIN },
};
/** How deep the head nods as they start (0‥1 down). */
const NOD: Record<How, number> = { peace: 0, thumb: 0, wave: 0, cheer: 0, sampeah: 0.25, smile: 0.12, nod: 0.45, calm: 0.25, photo: 0, look: 0.15 };

/** Not at all: rowing, dancing, a net's throw, on a bicycle, up a ladder, praying (kneeling, palms together, a bow), handing something over (alms to a monk, goods to a buyer). */
const NEVER: ReadonlySet<number> = new Set<number>([POSE.row, POSE.dance, POSE.cast, POSE.ride, POSE.climb, POSE.kneel, POSE.sampeah, POSE.bow, POSE.give]);
/** At work (they keep at it and look up): sweeping, stirring, planting, reaping, eating, the hammock. */
const BUSY: ReadonlySet<number> = new Set<number>([POSE.sweep, POSE.stir, POSE.plant, POSE.reap, POSE.eat, POSE.hammock]);
/** Sitting, squatting: they stay down. */
const SEATED: ReadonlySet<number> = new Set<number>([POSE.sit, POSE.stool, POSE.squat, POSE.eat, POSE.hammock]);
/** Hands or head busy: a kite's string, a torch, the shoulder pole, a basket on the head, a tray. */
const BUSY_FEATS: readonly Feature[] = [FEAT.kite, FEAT.torch, FEAT.pole, FEAT.headBasket, FEAT.tray];
/** Something in the hands (no gesture then: a smile): an umbrella, a flag, a broom, a net, lotus and incense, a bowl, a sickle… (a phone: a wave with it). */
const HANDS_FEATS: readonly Feature[] = [FEAT.umbrella, FEAT.flag, FEAT.broom, FEAT.net, FEAT.offering, FEAT.smallBowl, FEAT.paddle, FEAT.parcel, FEAT.sickle, FEAT.seedlings, FEAT.knife, FEAT.bowl];

interface Poser {
  a: Actor;
  how: How;
  style: Carry | null;
  feats: readonly Feature[];
  /** When they notice and start (people's clock, s), whether they have, and when they were last in the picture. */
  from: number;
  started: boolean;
  seen: number;
  /** They let go then (Infinity: holding); the gesture's arm is down then (−1: not coming down). */
  leave: number;
  down: number;
  /** Not again for this long after (s). */
  again: number;
  /** `LENS.shots` as they started. */
  shots: number;
  /** Walking as they noticed (a child waving on the move): walking on does not end it. Else where they stood (m): their scene taking them off ends it. */
  walking: boolean;
  x0: number;
  z0: number;
  /** Turns round to the camera (standing free), and the way it faces now. */
  turn: boolean;
  yaw: number;
  hop: boolean;
  nod: number;
  /** The hold on the actor (`Actor.held`: its `at` follows the camera). */
  hold: { at: Point; nod: number; pose: boolean };
}

export class SmileBack {
  private readonly live: Poser[] = [];
  private readonly spare: Poser[] = [];
  /** When each person (crowd index) last posed, and how long until they may again (people's clock, s). */
  private readonly last: Float64Array;
  private readonly wait: Float64Array;
  /** Posing now, by crowd index (no second plan for them). */
  private readonly posing: Uint8Array;
  /** The camera's ups so far (each a new roll of who poses how), and whether it was up last frame. */
  private ups = 0;
  private wasUp = false;
  /** The candidates of a pass and how far each is (reused: `candN` of them). */
  private readonly cand: (Actor | null)[];
  private readonly candD: Float64Array;
  private candN = 0;
  private shotsSeen = 0;
  private laughAt = -1e9;
  /** Nobody new poses until then (people's clock, s): after a photo. */
  private quiet = -1e9;
  /** `smile=<how>` (checks): everyone who can poses that way. */
  private readonly forced: How | null;

  constructor(
    private readonly env: PeopleEnv,
    private readonly actors: readonly Actor[],
  ) {
    const n = env.crowd.capacity;
    this.last = new Float64Array(n).fill(-1e9);
    this.wait = new Float64Array(n);
    this.posing = new Uint8Array(n);
    this.cand = new Array<Actor | null>(n).fill(null);
    this.candD = new Float64Array(n);
    for (let k = 0; k < MAX; k++) this.spare.push(poser());
    const q = env.params.get('smile') as How | null;
    this.forced = q && HOWS.includes(q) ? q : null;
  }

  /** Once a frame, after the scenes' steps and the greetings (`now`: the people's clock). */
  update(dt: number, now: number, f: MapFrame): void {
    const L = LENS;
    if (L.up && !this.wasUp) this.ups++;
    this.wasUp = L.up;
    // (a photo taken: a child laughs; nobody new starts a moment)
    const shutter = L.shots !== this.shotsSeen;
    this.shotsSeen = L.shots;
    if (shutter) this.quiet = now + QUIET;
    if (!L.up && !this.live.length) return;
    if (L.up) this.scan(now);
    const crowd = this.env.crowd;
    for (let k = this.live.length - 1; k >= 0; k--) {
      const p = this.live[k];
      const a = p.a;
      // (gone meanwhile: into a house, home for the night)
      if (!a.shown || !crowd.isShown(a.i)) {
        if (p.started) this.letGo(p, now, true);
        this.done(k, now);
        continue;
      }
      if (!p.started) {
        // (the camera went, or turned away, before they noticed; the photo was taken; or a greeting or a sale took them meanwhile)
        if (!L.up || now - p.seen > AWAY || now < this.quiet || a.held) {
          this.done(k, now, false);
          continue;
        }
        if (now < p.from) continue;
        this.start(p, now, f);
      }
      // The gesture's arm coming down: then their own look again.
      if (p.down >= 0) {
        if (now >= p.down) this.done(k, now);
        continue;
      }
      // When to go back to what they did.
      if (p.leave === Infinity) {
        if (!L.up) this.leaveIn(p, now, DOWN, AGAIN_SHORT);
        else if (now - p.seen > AWAY) this.leaveIn(p, now, AWAY_GO, AGAIN_SHORT);
        else if (L.shots !== p.shots) this.leaveIn(p, now, AFTER_SHOT, AGAIN);
        else if (now - p.from > MAX_HOLD) this.leaveIn(p, now, DOWN, AGAIN);
        // (their scene takes them off — not a step or two about their spot, a ball game's: they go on their way)
        else if (!p.walking && len(a.x - p.x0, a.z - p.z0) > OFF_SPOT) p.leave = now;
      }
      if (now >= p.leave || a.held !== p.hold) {
        this.letGo(p, now, false);
        if (p.down < 0) this.done(k, now);
        continue;
      }
      const u = now - p.from;
      // Looking at the camera (a visitor taking his photo back: at him); the nod dips and comes back up.
      if (p.how === 'photo') {
        p.hold.at.x = L.hx;
        p.hold.at.y = L.hy + EYE;
        p.hold.at.z = L.hz;
      } else {
        p.hold.at.x = L.x;
        p.hold.at.y = L.y;
        p.hold.at.z = L.z;
      }
      p.hold.nod = p.nod * bump(u, 0.3, 1.25);
      // Turning to it (standing on their feet), and a child's hops; their scene turns them back after.
      let hop = 0;
      if (p.hop && u < HOP * HOPS) hop = HOP_H * crowd.scale(a.i) * Math.max(0, Math.sin((u / HOP) * Math.PI * 2));
      if (p.turn) {
        const want = Math.atan2(L.x - a.x, L.z - a.z);
        p.yaw = wrap(p.yaw + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(want - p.yaw))));
        a.yaw = p.yaw;
      }
      if (p.turn || hop > 0) crowd.place(a.i, a.x, a.y + hop, a.z, a.yaw);
      // (the photo taken: the nearest child posing laughs)
      if (shutter && a.look.kind === 'kid' && p.how !== 'look') this.laugh(a, now, f);
    }
  }

  /** Who is in the picture now: those posing seen there again, the nearest others who notice it planned. */
  private scan(now: number): void {
    const L = LENS;
    const { dx, dy, dz } = L;
    // (the picture's across and up: across level, up square to the view)
    let h = Math.sqrt(dx * dx + dz * dz);
    const rx = h > 1e-4 ? -dz / h : 1;
    const rz = h > 1e-4 ? dx / h : 0;
    const ux = -rz * dy;
    const uy = rz * dx - rx * dz;
    const uz = rx * dy;
    const crowd = this.env.crowd;
    const cand = this.cand;
    this.candN = 0;
    const room = now < this.quiet ? 0 : MAX - this.live.length;
    for (const a of this.actors) {
      if (!a.shown || !crowd.isShown(a.i)) continue;
      const posing = this.posing[a.i] === 1;
      if (!posing && (room <= 0 || a.held || now - this.last[a.i] < this.wait[a.i])) continue;
      h = len(a.x - L.hx, a.z - L.hz);
      if (h > RANGE || Math.abs(a.y - L.hy) > LEVEL + LEVEL_SLOPE * h) continue;
      const vx = a.x - L.x;
      const vy = a.y + MID * crowd.scale(a.i) - L.y;
      const vz = a.z - L.z;
      const ahead = vx * dx + vy * dy + vz * dz;
      if (ahead < NEAR) continue;
      const k = (posing ? STAY : IN) * ahead;
      if (Math.abs(vx * rx + vz * rz) > L.tanH * k || Math.abs(vx * ux + vy * uy + vz * uz) > L.tanV * k) continue;
      if (posing) {
        for (const p of this.live) if (p.a === a) p.seen = now;
        continue;
      }
      // (they see it: not behind them — close by, whoever can turn round notices it anyway; a monk only what is before him)
      const d = len(vx, vz);
      const monk = a.look.kind === 'monk';
      if (Math.abs(wrap(Math.atan2(-vx, -vz) - a.yaw)) > (monk ? SEE_MONK : SEE) && (monk || d > NOTICE || !this.canTurn(a))) continue;
      if (this.howFor(a, 0.5, 0.5) === null) continue;
      if (this.candN >= cand.length) continue;
      this.candD[this.candN] = d;
      cand[this.candN++] = a;
    }
    // The nearest first, as many as there is room for.
    const n = Math.min(room, this.candN);
    let first = true;
    for (let j = 0; j < n; j++) {
      let best = -1;
      for (let c = 0; c < this.candN; c++) if (this.candD[c] >= 0 && (best < 0 || this.candD[c] < this.candD[best])) best = c;
      if (best < 0) break;
      this.plan(cand[best]!, now);
      this.candD[best] = -1;
      // (checks: who poses, how, how far)
      if (this.env.shot) {
        const p = this.live[this.live.length - 1];
        console.info(`[map] smile: ${first ? `${L.kind} at (${L.hx.toFixed(1)}, ${L.hz.toFixed(1)}) → ` : '  …'}${p.a.look.kind ?? 'someone'} ${p.how} ${len(p.a.x - L.hx, p.a.z - L.hz).toFixed(1)} m (starts in ${(p.from - now).toFixed(2)} s)`);
        first = false;
      }
    }
  }

  /** How they pose (by who they are and what they are doing; `r1`, `r2` their dice), or null: not at all. */
  private howFor(a: Actor, r1: number, r2: number): How | null {
    const look = a.look;
    const kind = look.kind ?? 'villager';
    const pose = a.currentPose;
    if (a.performing || NEVER.has(pose) || this.aloft(a)) return null;
    const walking = a.speed > WALKING;
    const seated = SEATED.has(pose);
    const busy = BUSY.has(pose) || look.carry === CARRY.kite || hasAny(look.feats, BUSY_FEATS);
    // Monks keep their calm: standing, the hands together before them; at work, a look up; walking or sitting, nothing.
    if (kind === 'monk') return walking || seated || a.riding ? null : busy ? 'look' : 'calm';
    if (busy || seated || a.riding) return 'look';
    if (walking) return kind === 'kid' ? 'wave' : 'look';
    // (a phone in the hand: no sign of the hand, no sampeah, but a wave with it; something bigger: a smile)
    const phone = look.carry === CARRY.phone || look.feats.includes(FEAT.phone);
    const full = handsFull(look);
    const f = this.forced;
    if (f && f !== 'calm') return full ? 'smile' : phone && (WAY[f].style !== null || f === 'sampeah') ? 'wave' : f;
    const selfie = LENS.kind === 'selfie';
    if (full) return kind === 'kid' ? 'wave' : 'smile';
    if (kind === 'kid') return selfie ? (r1 < 0.6 ? 'wave' : r1 < 0.8 ? 'cheer' : 'peace') : r1 < 0.4 ? 'peace' : r1 < 0.75 ? 'wave' : 'cheer';
    if (kind === 'visitor') {
      if (!selfie && r1 < 0.25 && (phone || look.feats.includes(FEAT.camera))) return 'photo';
      if (phone) return r2 < 0.65 ? 'wave' : 'smile';
      return r2 < (selfie ? 0.6 : 0.5) ? 'wave' : 'thumb';
    }
    if (isElder(look)) return !phone && r1 < 0.35 ? 'sampeah' : 'nod';
    if (selfie || phone) return r1 < 0.55 ? 'wave' : 'smile';
    return r1 < 0.45 ? 'smile' : r1 < 0.72 ? 'sampeah' : 'wave';
  }

  /** One person poses: how, when they notice. */
  private plan(a: Actor, now: number): void {
    // (new dice each time the camera comes up, and after each photo: another pose for the next)
    const roll = this.ups * 61 + LENS.shots;
    const r1 = hash3(a.i, roll, 3, 91);
    const r2 = hash3(a.i, roll, 5, 92);
    const r3 = hash3(a.i, roll, 7, 93);
    const how = this.howFor(a, r1, r2)!;
    const p = this.spare.pop() ?? poser();
    const way = WAY[how];
    p.a = a;
    p.how = how;
    // (a monk with something in his hands but the bowl: no hands together, only his calm)
    p.style = how === 'calm' && a.look.carry !== CARRY.none && a.look.carry !== CARRY.bowl ? null : way.style;
    // (monks keep their calm face)
    p.feats = a.look.kind === 'monk' ? NONE : way.feats;
    p.from = now + NOTICE_T[0] + (NOTICE_T[1] - NOTICE_T[0]) * r3;
    p.started = false;
    p.seen = now;
    p.leave = Infinity;
    p.down = -1;
    p.again = AGAIN_SHORT;
    p.shots = LENS.shots;
    p.walking = a.speed > WALKING;
    // (a monk does not turn round to a camera: he looks, calm, from where he stands)
    p.turn = !p.walking && a.look.kind !== 'monk' && this.canTurn(a);
    p.yaw = a.yaw;
    p.hop = a.look.kind === 'kid' && !p.walking && (how === 'wave' || how === 'cheer') && r2 < 0.75;
    p.nod = NOD[how];
    p.hold.pose = way.pose !== null && (!p.walking || how === 'wave');
    this.live.push(p);
    this.posing[a.i] = 1;
  }

  /** They notice it: hold them, pose them, the smile on. */
  private start(p: Poser, now: number, f: MapFrame): void {
    const a = p.a;
    p.started = true;
    p.yaw = a.yaw;
    p.x0 = a.x;
    p.z0 = a.z;
    p.shots = LENS.shots;
    p.hold.at.x = LENS.x;
    p.hold.at.y = LENS.y;
    p.hold.at.z = LENS.z;
    p.hold.nod = 0;
    a.held = p.hold;
    const way = WAY[p.how];
    if (p.hold.pose && way.pose !== null) a.crowd.pose(a.i, way.pose, now);
    if (p.feats.length || p.style !== null) a.crowd.strike(a.i, p.feats, p.style, 1, now);
    if (p.hop) this.laugh(a, now, f);
  }

  /** Back to what they did from `when` (s from now, between the two), not again for `again` s. */
  private leaveIn(p: Poser, now: number, when: readonly [number, number], again: number): void {
    p.leave = now + when[0] + (when[1] - when[0]) * hash3(p.a.i, this.ups, LENS.shots, 94);
    p.again = again;
  }

  /** Their pose lets go (the scene's own again, eased); a gesture's arm comes down first (`down`), at `now` (`gone`: at once). */
  private letGo(p: Poser, now: number, gone: boolean): void {
    const a = p.a;
    if (a.held === p.hold) a.release(now);
    if (p.style !== null && !gone) {
      a.crowd.strike(a.i, NONE, p.style, 0, now);
      p.down = now + ARM_DOWN;
    } else a.crowd.unstrike(a.i, now);
  }

  /** Done: their own look again; not again for a while (`posed`: they did pose). */
  private done(k: number, now: number, posed = true): void {
    const p = this.live[k];
    const a = p.a;
    if (posed) {
      a.crowd.unstrike(a.i, now);
      if (a.held === p.hold) a.release(now);
      this.last[a.i] = now;
      this.wait[a.i] = p.again;
    }
    this.posing[a.i] = 0;
    this.live.splice(k, 1);
    this.spare.push(p);
  }

  /** A child laughs (not over and over). */
  private laugh(a: Actor, now: number, f: MapFrame): void {
    if (now - this.laughAt < LAUGH_AGAIN || f.dt <= 0) return;
    this.laughAt = now;
    f.calls.push({ kind: 'laugh', x: a.x, y: a.y + 1, z: a.z, gain: 0.55 });
  }

  /** Standing on their feet, free: they turn round to the camera (riders, people sitting or walking and the busy do not). */
  private canTurn(a: Actor): boolean {
    const pose = a.currentPose;
    return !a.riding && a.speed <= WALKING && !SEATED.has(pose) && !BUSY.has(pose) && !NEVER.has(pose) && !a.performing;
  }

  /** Up a ladder or a palm (riding high over dry land), not standing in a boat. */
  private aloft(a: Actor): boolean {
    if (!a.riding) return false;
    const field = this.env.ground.field;
    const w = field.waterAt(a.x, a.z);
    if (w !== null && a.y < w + 1.2) return false;
    return a.y > field.heightAt(a.x, a.z) + 1.5;
  }
}

/** A pose in waiting (its objects made once). */
function poser(): Poser {
  return {
    a: null as unknown as Actor,
    how: 'look',
    style: null,
    feats: NONE,
    from: 0,
    started: false,
    seen: 0,
    leave: Infinity,
    down: -1,
    again: 0,
    shots: 0,
    walking: false,
    x0: 0,
    z0: 0,
    turn: false,
    yaw: 0,
    hop: false,
    nod: 0,
    hold: { at: { x: 0, y: 0, z: 0 }, nod: 0, pose: false },
  };
}

/** Something in their hands but a phone: no gesture of the hand, a smile. */
function handsFull(look: Look): boolean {
  return (look.carry !== CARRY.none && look.carry !== CARRY.phone) || hasAny(look.feats, HANDS_FEATS);
}

/** Does `feats` hold any of `list` (loops: no closure a call)? */
function hasAny(feats: readonly Feature[], list: readonly Feature[]): boolean {
  for (let k = 0; k < feats.length; k++) if (list.includes(feats[k])) return true;
  return false;
}

/** A smooth rise and fall over [a, b] (s): 0 outside, 1 in the middle. */
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}
