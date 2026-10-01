import { Vector3, type Object3D } from 'three';
import { festivalNow } from '../festival/_schedule';
import { BLESS, BLESS_SCRIPT, BLESS_SEATS, blessHour, blessMonk, SCRIPT_AT, seatFront, TIE, type BlessAsk, type BlessAway, type BlessSeat, type BlessState } from '../roam/_blessingHooks';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { Actor, wrap } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { FEAT, POSE, SLOT, type Look } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { villageGround } from './_sceneVillage';
import { Rig, RigDef } from './_things';

/**
 * A monk who blesses (roam/_blessing.ts, the link `BLESS`: roam/_blessingHooks.ts):
 * in the floating village pagoda's hall, on a low dais against the east
 * wall (to the Buddha's right), facing across the hall, an elder monk sits
 * cross-legged on a woven mat, a triangular cushion (ខ្នើយ) behind him; by his
 * right knee a silver bowl of lustral water (ផ្តិលទឹកមន្ត) on its foot, lotus
 * petals on the water and a sprig of leaves with a lotus bud resting in it; by
 * his left a silver plate with a ball of red cotton string (អំបោះក្រហម).
 *
 * - **When**: by day (`blessHour`: after the dawn chant until his meal before
 *   noon, and from after it until the dusk drum); not at night, not at his
 *   meal, not while the pagoda keeps Pchum Ben or Visak Bochea (the monks are
 *   on the porch with the faithful then: festival/_pchumBen.ts, _visak.ts).
 *   Out of sight he simply comes or goes; seen (the camera near, him in its
 *   view), he gets up, steps off the dais and walks out of the hall's door and
 *   along the porch (or back in, and sits down). Never in the middle of a
 *   blessing.
 * - **Blessing** (`BLESS.ask`, led by roaming): he looks at the one kneeling
 *   and nods; chants the Pali blessing (bubbles: the verse in Khmer script, as
 *   Cambodians read Pali) while his right hand (`POSE.bless`, `BLESS_SCRIPT`)
 *   takes the sprig from the bowl, dips it and flicks the water over him (a few
 *   drops fly to him); leans forward and ties the red string round his wrist
 *   with both hands, murmuring "āyu vaṇṇo sukhaṃ balaṃ"; says the blessing in
 *   Khmer; watches him bow. A second time in a visit: a smile and a nod.
 *
 * Everything he has is boxes of the people's things (one draw with the rest);
 * the drops are worked out from the time since each flick (no state: a shot
 * shows them in the air).
 */

/** The monk's look: an elder, the sprig's stem, leaves and lotus bud (`FEAT.sprig`: `wood`, `prop2`, `prop`). */
const SPRIG = { stem: 0x6f8f3a, leaf: 0x4f9a3c, bud: 0xec8fb0 } as const;
/** His things' colours. */
const C = {
  wood: 0x5a2e1e,
  woodDark: 0x43221a,
  gold: 0xc9a24a,
  mat: 0xe6d6ab,
  matRed: 0xa8322a,
  matGreen: 0x3f6a3a,
  cushion: 0x7a2420,
  pillow: 0x9e2a22,
  silver: 0xdcd8d0,
  silverDark: 0xa9a397,
  water: 0x9cc0c4,
  petal: 0xf2a8c0,
  string: 0xc41e24,
  stringDark: 0x941418,
  drop: 0xe8f6ff,
} as const;

/** Paces: every frame within this of the camera (m); hidden past this. */
const PACE_NEAR = 60;
const PACE_HIDE = 220;
/** Seen by the camera: within this (m) and inside this cone round its view (cos of the angle). */
const SEEN_NEAR = 34;
const SEEN_CONE = Math.cos((62 * Math.PI) / 180);
/** Getting up or sitting down (s), stepping off the dais by its step or up onto it (s, both steps), his walking pace (m/s). */
const RISE_T = 0.75;
const STEP_T = 1.4;
const PACE = 0.55;
/** The drops of a flick: how many, how long they fly (s), their size (m). */
const DROPS = 7;
const DROP_FLY = 0.42;
const DROP_W = 0.024;
const G = 9.8;

/** The people model's bones as the blessing's arms use them (model metres, _personModel.ts `PIVOT`), and its drop sitting. */
const PIV = { chest: [0, 0.62, 0], armL: [0.26, 0.95, 0], foreL: [0.297, 0.73, 0], gripL: [0.297, 0.555, 0], armR: [-0.26, 0.95, 0], foreR: [-0.297, 0.73, 0], gripR: [-0.297, 0.555, 0] } as const;
const SIT_DROP = 0.4;
/**
 * Seated, his eyes are this much lower than `Actor.step` takes them to be (it aims the head from a standing person's
 * eyes, 1.25 model m up; sitting cross-legged they are ≈ 0.93 up): what he looks at is raised as much (m).
 */
const SEATED_EYE = (1.25 - 0.93) * 1.37;

type Life = 'gone' | 'sit' | 'rise' | 'stepDown' | 'walkOut' | 'wait' | 'walkIn' | 'stepUp' | 'sitDown';

export class BlessingMonk implements PeopleScene {
  readonly name = 'blessing';
  readonly actors: Actor[] = [];
  private readonly seat: BlessSeat = BLESS_SEATS[0];
  private readonly pace = new Pace(PACE_NEAR, PACE_HIDE);
  private readonly monk: Actor;
  private readonly plain: Look;
  private readonly holding: Look;
  private readonly dais: Rig;
  /** The sprig resting in the bowl (shown while not in his hand). */
  private readonly sprig: Rig;
  private readonly drops: number;
  private readonly bubble = new Bubble();
  private bubbleUntil = -1e9;
  private life: Life = 'gone';
  /** Seconds into a step of his life, the leg of his walk. */
  private lt = 0;
  private leg = 0;
  /** His way out of the hall (floor points, m): from before the dais to the porch beyond the door. */
  private readonly way: Point[];
  private shown = false;
  /** The blessing he follows (`BLESS.ask.n`), his script's start (people's clock) and what is said of it so far. */
  private askN = -1;
  private scriptAt = NaN;
  private saying: WordKey | null = null;
  private sprigInHand = false;
  private struck = false;
  /** Where his hands tie the string and where the sprig's tip is at a flick (m), worked out once. */
  private readonly hands = new Vector3();
  private readonly tip = new Vector3();
  private readonly look: Point = { x: 0, y: 0, z: 0 };
  private readonly head = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => this.head;
  private readonly cam = new Vector3();
  /** `bless=` in the URL (a check): he sits there at once, whatever the clock says (`blessmonk=0`: away). */
  private readonly urlSits: boolean | null;
  /** A headless still (not a video's frames): roaming's time stands still while the people's runs on. */
  private readonly still: boolean;
  /** `blesspose=<state>:<s>` (a check of the monk alone, no roaming add-on): a blessing that far in, before the seat's kneeling place. */
  private readonly fake: BlessAsk | null;

  constructor(
    private readonly env: PeopleEnv,
    scene: Object3D,
  ) {
    const s = this.seat;
    const ground = villageGround(env, scene);
    const look = dress('monk', 1077);
    look.colors[SLOT.wood] = SPRIG.stem;
    look.colors[SLOT.prop2] = SPRIG.leaf;
    look.colors[SLOT.prop] = SPRIG.bud;
    this.plain = look;
    this.holding = { ...look, feats: [...look.feats, FEAT.sprig] };
    this.monk = new Actor(env.crowd, look, ground).avoid(env.traffic, this.name);
    this.actors.push(this.monk);
    this.dais = new Rig(env.things, daisDef());
    this.sprig = new Rig(env.things, sprigDef());
    this.drops = env.things.alloc(DROPS);
    for (let k = 0; k < DROPS; k++) env.things.paint(this.drops + k, C.drop, 0.35);
    // His way out: off the dais by its step to the floor before it, to the door, onto the porch and along it (past the
    // door's jamb).
    const X = s.dais.x - 3.0;
    this.way = [
      { x: s.step.x + Math.sin(s.yaw) * 0.42, y: s.floor, z: s.step.z + Math.cos(s.yaw) * 0.42 },
      { x: X + 0.6, y: s.floor, z: 101.2 },
      { x: X, y: s.floor, z: 99.9 },
      // (along the porch behind where the festivals' monks sit, between them and the wall: Pchum Ben's at x ± 2.35,
      // ± 3.65 and Visak's at ± 4.35, z ≈ 97.55 — festival/_pchumBen.ts, _visak.ts —, never through them)
      { x: X, y: s.floor, z: 98.4 },
      { x: X + 3.2, y: s.floor, z: 98.4 },
    ];
    this.workOutHands();
    const q = env.params;
    this.urlSits = q.has('bless') || q.has('blesspose') ? q.get('blessmonk') !== '0' : q.get('blessmonk') === '1' ? true : q.get('blessmonk') === '0' ? false : null;
    this.still = env.shot && q.get('video') !== '1';
    const fp = q.get('blesspose')?.split(':');
    const kneel = seatFront(s, s.kneel, { x: 0, z: 0 });
    this.fake = fp ? { state: fp[0] as BlessState, n: -2, id: s.id, t: Number(fp[1] ?? 0) || 0, x: kneel.x, y: s.floor, z: kneel.z } : null;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const s = this.seat;
    const m = blessMonk(s.id);
    // Where he should be: by the hours, the festivals; a blessing keeps him.
    const ask = this.ask();
    const mine = ask.id === s.id && ask.state !== 'none';
    const hour = blessHour(f.clock);
    const fest = festivalNow(f);
    const away: BlessAway = this.urlSits === true ? null : this.urlSits === false ? 'gone' : fest === 'pchumben' || fest === 'visak' ? 'fest' : hour === 'sit' ? null : hour;
    const want = mine || away === null;
    // The link (his hands' place is fixed); far off he is not drawn, but he would be there as one comes.
    m.hx = this.hands.x;
    m.hy = this.hands.y;
    m.hz = this.hands.z;
    m.t = f.t;
    const step = this.pace.step(dt, viewDist(f, s.x, s.z));
    if (step < 0) {
      this.hideAll();
      this.quiet(f);
      m.there = want;
      m.away = away;
      return;
    }
    if (step === 0 && this.shown) {
      if (!mine) this.quiet(f);
      this.talk(dt, now, f);
      return;
    }
    dt = step;
    const first = !this.shown;
    this.shown = true;
    this.dais.place(s.x, s.y, s.z, s.yaw).write();
    this.live(dt, now, f, want, first);
    // (free to bless only seated, staying)
    m.there = this.life === 'sit' && want;
    m.away = m.there ? null : (away ?? 'gone');

    if (this.life === 'sit') this.bless(now, ex, mine);
    else this.offScript(now);
    // (the blessing cut off, or he is off his seat: his words go with it)
    if (!mine || this.life !== 'sit') this.quiet(f);
    this.monk.step(dt, now);
    // The sprig: in his hand or resting in the bowl.
    if (this.sprigInHand) this.sprig.hide();
    else this.sprig.place(s.x, s.y, s.z, s.yaw).write();
    this.drawDrops(mine && ask.state === 'chant');
    this.talk(dt, now, f);
  }

  /** His words over his head while they last, then gone for good (not left faint, nor where he no longer is). */
  private talk(dt: number, now: number, f: MapFrame): void {
    if (this.bubbleUntil <= now) {
      this.quiet(f);
      return;
    }
    this.head.x = this.monk.x;
    this.head.y = this.monk.y + 1.42 * this.env.crowd.scale(this.monk.i);
    this.head.z = this.monk.z;
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  /** His words gone at once: the blessing cut off, the scene hidden far off, he gets up (nothing said: nothing to do). */
  private quiet(f: MapFrame): void {
    if (this.bubbleUntil === -1e9) return;
    this.bubbleUntil = -1e9;
    this.saying = null;
    // (a whole second off the roaming: its time and its fade both end now, so it hides)
    this.bubble.update(1, f.camera, false);
  }

  // ── His day: sitting, getting up and walking out, walking in and sitting down ──

  private live(dt: number, now: number, f: MapFrame, want: boolean, first: boolean): void {
    const a = this.monk;
    const s = this.seat;
    // (where he should be, settled: nothing to do)
    if (!first && ((want && this.life === 'sit') || (!want && this.life === 'gone'))) return;
    // (out of sight, or a still's first look: he is simply there, or not)
    if (first || !this.seen(f)) {
      if (want && this.life !== 'sit') this.sitNow(now);
      else if (!want && this.life !== 'gone') this.goNow();
      return;
    }
    this.lt += dt;
    switch (this.life) {
      case 'gone':
        // (seen: he comes in from the porch's end, if that is out of sight; else he waits a little longer)
        if (want && !this.seenAt(f, this.way[this.way.length - 1])) {
          const p = this.way[this.way.length - 1];
          a.warp(p.x, p.y, p.z, -Math.PI / 2);
          a.show();
          a.pose(POSE.stand, now);
          this.go('walkIn');
          this.leg = this.way.length - 2;
        }
        break;
      case 'sit':
        if (!want) {
          a.pose(POSE.stand, now);
          this.go('rise');
        }
        break;
      case 'rise':
        a.ride(s.x, s.y, s.z, s.yaw);
        if (this.lt >= RISE_T) this.go('stepDown');
        break;
      case 'stepDown': {
        // Down off the dais by its step: onto the step, then the floor before it.
        const k = Math.min(1, this.lt / STEP_T);
        this.stairs(k, k < 0.5 ? this.downYaw : s.yaw);
        if (this.lt >= STEP_T) {
          const p = this.way[0];
          a.warp(p.x, p.y, p.z, s.yaw);
          this.leg = 1;
          this.go('walkOut');
        }
        break;
      }
      case 'walkOut': {
        const p = this.way[this.leg];
        a.goTo(p.x, p.z, PACE);
        a.face(null);
        if (a.dist(p.x, p.z) < 0.25) {
          if (this.leg < this.way.length - 1) this.leg++;
          else this.go('wait');
        }
        break;
      }
      case 'wait':
        // (at the porch's end: gone once nobody sees him go; back in if he is wanted again)
        a.stop(Math.PI / 2);
        if (want) {
          this.leg = this.way.length - 2;
          this.go('walkIn');
        } else if (!this.seenAt(f, a)) this.goNow();
        break;
      case 'walkIn': {
        const p = this.way[this.leg];
        a.goTo(p.x, p.z, PACE);
        a.face(null);
        if (a.dist(p.x, p.z) < 0.25) {
          if (this.leg > 0) this.leg--;
          else {
            a.ride(a.x, a.y, a.z, a.yaw);
            this.go('stepUp');
          }
        }
        if (!want && this.leg >= 2) {
          // (wanted away again on his way in: back out)
          this.leg++;
          this.go('walkOut');
        }
        break;
      }
      case 'stepUp': {
        // Up onto the step and the dais, round to face the hall at his place.
        const k = Math.min(1, this.lt / STEP_T);
        const up = this.downYaw + Math.PI;
        this.stairs(1 - k, k < 0.5 ? s.yaw + Math.PI : up + wrap(s.yaw - up) * smooth((k - 0.5) / 0.5));
        if (this.lt >= STEP_T) {
          a.ride(s.x, s.y, s.z, s.yaw);
          a.pose(POSE.sit, now);
          this.go('sitDown');
        }
        break;
      }
      case 'sitDown':
        a.ride(s.x, s.y, s.z, s.yaw);
        if (this.lt >= RISE_T) this.go('sit');
        break;
    }
  }

  private go(l: Life): void {
    this.life = l;
    this.lt = 0;
  }

  /** Facing from his place down to the step (radians). */
  private get downYaw(): number {
    const s = this.seat;
    return Math.atan2(s.step.x - s.x, s.step.z - s.z);
  }

  /** On the way between his place and the floor before the step (`k` 0 his place ‥ ½ on the step ‥ 1 the floor), a little hop each. */
  private stairs(k: number, yaw: number): void {
    const s = this.seat;
    const st = s.step;
    const p = this.way[0];
    const u = smooth(k < 0.5 ? k * 2 : k * 2 - 1);
    const hop = Math.sin(Math.PI * u) * 0.07;
    if (k < 0.5) this.monk.ride(s.x + (st.x - s.x) * u, s.y + (st.top - s.y) * u + hop, s.z + (st.z - s.z) * u, yaw);
    else this.monk.ride(st.x + (p.x - st.x) * u, st.top + (p.y - st.top) * u + hop, st.z + (p.z - st.z) * u, yaw);
  }

  /** On his dais at once (out of sight, or a still). */
  private sitNow(now: number): void {
    const a = this.monk;
    const s = this.seat;
    a.ride(s.x, s.y, s.z, s.yaw);
    a.show();
    a.pose(POSE.sit, now);
    this.monk.crowd.pose(a.i, POSE.sit, now, true);
    this.go('sit');
  }

  /** Gone at once (out of sight). */
  private goNow(): void {
    this.monk.hide();
    this.monk.performing = false;
    this.go('gone');
  }

  /** The camera sees his place (near, and it in view): he walks in and out rather than appear or vanish. */
  private seen(f: MapFrame): boolean {
    return this.seenAt(f, this.seat) || (this.life !== 'gone' && this.life !== 'sit' && this.seenAt(f, this.monk));
  }

  private seenAt(f: MapFrame, p: Point): boolean {
    if (f.roam === 'overview') return false;
    const c = f.camera.position;
    const dx = p.x - c.x;
    const dy = p.y + 1 - c.y;
    const dz = p.z - c.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > SEEN_NEAR) return false;
    if (d < 3) return true;
    f.camera.getWorldDirection(this.cam);
    if ((dx * this.cam.x + dy * this.cam.y + dz * this.cam.z) / d <= SEEN_CONE) return false;
    // (and nothing solid between: the hall's walls hide him once he is out of its door)
    const w = this.monk.ground.walk;
    return !w || w.clearance(c.x, c.y, c.z, p.x, p.y + 1.2, p.z) > 0.97;
  }

  // ── The blessing ──

  /** The blessing on now (roaming's), or a check's (`blesspose=`). */
  private ask(): BlessAsk {
    return BLESS.ask.state === 'none' && this.fake ? this.fake : BLESS.ask;
  }

  private bless(now: number, ex: Obstacle | null, mine: boolean): void {
    const a = this.monk;
    const ask = this.ask();
    const crowd = this.env.crowd;
    a.ride(this.seat.x, this.seat.y, this.seat.z, this.seat.yaw);
    if (!mine) {
      this.offScript(now);
      // Calm, his eyes down; he looks up at whoever comes before him.
      const near = ex && Math.abs(ex.y - a.y) < 2 && a.dist(ex.x, ex.z) < 6;
      if (near) {
        this.look.x = ex.x;
        this.look.y = ex.y + 2.0 + SEATED_EYE;
        this.look.z = ex.z;
        a.lookAt(this.look, now + 1);
        a.tilt(0);
      } else {
        a.lookAt(null);
        a.tilt(0.32);
      }
      return;
    }
    a.performing = true;
    if (ask.n !== this.askN) {
      this.askN = ask.n;
      this.scriptAt = NaN;
      this.saying = null;
    }
    const t = ask.t;
    // He looks at the one before him (kneeling: his face; tying, a little higher, his head kept up and back from the face
    // so close: the pose's head brings his eyes down to the wrist).
    this.look.x = ask.x;
    this.look.y = ask.y + (ask.state === 'tie' ? 2.0 : 1.7) + SEATED_EYE;
    this.look.z = ask.z;
    a.lookAt(this.look, now + 1);
    switch (ask.state) {
      case 'kneel':
        a.pose(POSE.sit, now);
        a.carry(0, now);
        // (a slow nod as he kneels)
        a.tilt(0.3 * bump(t, 1.2, 2.6));
        break;
      case 'chant': {
        a.carry(0, now);
        a.tilt(0.18);
        if (t < SCRIPT_AT) a.pose(POSE.sit, now);
        else {
          // The script s s in: started once (a shot's jump, or a slow frame: started again where it should be).
          const sIn = t - SCRIPT_AT;
          if (Number.isNaN(this.scriptAt) || Math.abs(now - this.scriptAt - sIn) > 0.12) {
            const fresh = Number.isNaN(this.scriptAt) && sIn < 0.3;
            this.scriptAt = now - sIn;
            a.pose(POSE.bless, this.scriptAt);
            // (a jump: there at once — through the sitting pose, so the same pose takes its new start)
            if (!fresh) {
              crowd.pose(a.i, POSE.sit, now, true);
              crowd.pose(a.i, POSE.bless, this.scriptAt, true);
            }
          }
          this.holdSprig(sIn >= BLESS_SCRIPT.take && sIn < BLESS_SCRIPT.put);
        }
        this.say('blessPali1', t, 0.35, 3.7, now);
        this.say('blessPali2', t, 4.25, 3.7, now);
        break;
      }
      case 'tie':
        this.keepScript(now);
        this.holdSprig(false);
        a.carry(t >= TIE.reach && t < TIE.back ? 1 : 0, now);
        a.tilt(0);
        this.say('blessPali3', t, TIE.wind - 0.1, TIE.knot - TIE.wind + 0.6, now);
        break;
      case 'words':
        this.holdSprig(false);
        a.carry(0, now);
        if (t > 0.7) a.pose(POSE.sit, now);
        else this.keepScript(now);
        a.tilt(0.1 * bump(t, 0.3, 1.6));
        this.say('blessSay', t, 0.3, 3.2, now);
        break;
      case 'bow':
        this.holdSprig(false);
        a.pose(POSE.sit, now);
        a.carry(0, now);
        a.tilt(0.2);
        break;
      case 'again':
        this.holdSprig(false);
        a.pose(POSE.sit, now);
        a.carry(0, now);
        // A smile and a nod.
        if (t < 2.8 && !this.struck) {
          crowd.strike(a.i, SMILE, null, 0, now);
          this.struck = true;
        } else if (t >= 2.8 && this.struck) {
          crowd.unstrike(a.i, now);
          this.struck = false;
        }
        a.tilt(0.42 * bump(t, 0.35, 1.7));
        this.say('blessAgainSay', t, 0.3, 2.8, now);
        break;
    }
  }

  /** Keep `POSE.bless` (its script over: his hand on his knee) for the tie. */
  private keepScript(now: number): void {
    const a = this.monk;
    if (this.env.crowd.poseOf(a.i) === POSE.bless) return;
    this.scriptAt = now - BLESS_SCRIPT.end - 1;
    a.pose(POSE.bless, this.scriptAt);
    this.env.crowd.pose(a.i, POSE.sit, now, true);
    this.env.crowd.pose(a.i, POSE.bless, this.scriptAt, true);
  }

  /** No blessing: his own look and pose, the sprig in the bowl, his smile gone. */
  private offScript(now: number): void {
    const a = this.monk;
    this.holdSprig(false);
    if (this.struck) {
      this.env.crowd.unstrike(a.i, now);
      this.struck = false;
    }
    if (this.askN !== -1 && this.ask().state === 'none') {
      this.askN = -1;
      this.scriptAt = NaN;
    }
    a.performing = false;
    if (this.life === 'sit') {
      a.pose(POSE.sit, now);
      a.carry(0, now);
    }
  }

  private holdSprig(on: boolean): void {
    if (on === this.sprigInHand) return;
    this.sprigInHand = on;
    const a = this.monk;
    a.look = on ? this.holding : this.plain;
    this.env.crowd.dress(a.i, a.look);
  }

  /** Say `key` once in this blessing, from `at` s into its step, for `len` s. */
  /**
   * Say `key` from `at` s into the blessing's step for `len` s (`t`: roaming's time in it): once, for as long as is
   * left of it (said again only if it went, more than a moment before its end: a still holds the step's time).
   */
  private say(key: WordKey, t: number, at: number, len: number, now: number): void {
    const left = at + len - t;
    if (t < at || left <= 0) return;
    if (this.saying === key && (this.bubble.showing || left < 0.6)) return;
    this.saying = key;
    this.head.x = this.monk.x;
    this.head.y = this.monk.y + 1.42 * this.env.crowd.scale(this.monk.i);
    this.head.z = this.monk.z;
    // (a still: roaming's time stands while the people's runs on before the picture, so it stays)
    const len2 = this.still ? left + 5 : left;
    this.bubble.say(key, this.headAt, len2);
    this.bubbleUntil = now + len2 + 0.6;
  }

  /** The drops of each flick, flying from the sprig's tip to the face of the one kneeling (worked out from the time since the flick). */
  private drawDrops(on: boolean): void {
    const th = this.env.things;
    const ask = this.ask();
    let tau = -1;
    if (on) {
      // (by the blessing's own time, roaming's: a still shows them where its moment has them)
      const sIn = ask.t - SCRIPT_AT;
      for (const fl of BLESS_SCRIPT.flicks) if (sIn >= fl && sIn < fl + DROP_FLY) tau = sIn - fl;
    }
    if (tau < 0) {
      th.hide(this.drops, DROPS);
      return;
    }
    // (to his face and shoulders: kneeling, about 1.6 m over his feet)
    const p = this.tip;
    const tx = ask.x - p.x;
    const ty = ask.y + 1.55 - p.y;
    const tz = ask.z - p.z;
    for (let k = 0; k < DROPS; k++) {
      // (each its own way: a spread round his face, a little faster or slower)
      const ox = (hashf(k, 1) - 0.5) * 0.9;
      const oy = (hashf(k, 2) - 0.5) * 0.7;
      const oz = (hashf(k, 3) - 0.5) * 0.9;
      const fly = DROP_FLY * (0.75 + 0.35 * hashf(k, 4));
      const u = tau / fly;
      if (u >= 1) {
        th.hide(this.drops + k);
        continue;
      }
      const vx = (tx + ox) / fly;
      const vy = (ty + oy) / fly + 0.5 * G * fly;
      const vz = (tz + oz) / fly;
      const x = p.x + vx * tau;
      const y = p.y + vy * tau - 0.5 * G * tau * tau;
      const z = p.z + vz * tau;
      // (a short streak along its flight)
      const dy = vy - G * tau;
      const sp = Math.sqrt(vx * vx + dy * dy + vz * vz) || 1;
      const l = 0.07;
      th.segment(this.drops + k, x, y, z, x - (vx / sp) * l, y - (dy / sp) * l, z - (vz / sp) * l, DROP_W);
    }
  }

  /** Where his hands meet at the tie and where the sprig's tip is at a flick (the people model's bones, as the shader poses them). */
  private workOutHands(): void {
    const k = this.env.crowd.scale(this.monk.i);
    // (_personModel.ts `BLESS_ARM.tie`, `tieL`, the chest leaning `BLESS_TIE_LEAN`)
    const r = fist('R', [-1.083, 0.251, 0.453], 0, 0.06);
    const l = fist('L', [-0.757, -0.257, -0.376], -0.69, 0.06);
    this.toWorld((r[0] + l[0]) / 2, (r[1] + l[1]) / 2 - 0.035, (r[2] + l[2]) / 2, k, this.hands);
    // The flick: the fist forward, the sprig's lotus 0.32 out along its grip, tipped 0.2 below level.
    const f = fist('R', [-1.56, 0.13, 0.12], -0.2, 0.1);
    this.toWorld(f[0], f[1] - 0.33 * Math.sin(0.2), f[2] + 0.33 * Math.cos(0.2), k, this.tip);
  }

  /** A point of his (model metres, his frame: +x his left, +z ahead; seated) on the map. */
  private toWorld(x: number, y: number, z: number, k: number, out: Vector3): Vector3 {
    const s = this.seat;
    const c = Math.cos(s.yaw);
    const n = Math.sin(s.yaw);
    return out.set(s.x + (x * c + z * n) * k, s.y + y * k, s.z + (-x * n + z * c) * k);
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    this.monk.hide();
    this.monk.performing = false;
    this.dais.hide();
    this.sprig.hide();
    this.env.things.hide(this.drops, DROPS);
    this.go('gone');
  }

  report(traffic: Traffic): void {
    const a = this.monk;
    if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

/** The smile (`Crowd.strike`): his calm face lit up. */
const SMILE = [FEAT.grin] as const;

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** Up from `a`, down by `b` (0‥1‥0). */
const bump = (t: number, a: number, b: number) => (t <= 0 || t >= b ? 0 : t < a ? smooth(t / a) : 1 - smooth((t - a) / (b - a)));
const hashf = (k: number, s: number) => {
  const v = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The fist of a seated person (`POSE.sit`'s hips, the chest pitched `chest`) with the arm's turn `arm` (x, y, z)
 * and the forearm's pitch `fore`: model metres from the seat. The shader's chain (_personModel.ts `pChain`): each
 * bone turns about its pivot (Euler y · x · z), the forearm's, then the arm's, then the chest's; the hips drop.
 */
function fist(side: 'L' | 'R', arm: readonly [number, number, number], fore: number, chest: number): [number, number, number] {
  const A = side === 'R' ? PIV.armR : PIV.armL;
  const F = side === 'R' ? PIV.foreR : PIV.foreL;
  const P = side === 'R' ? PIV.gripR : PIV.gripL;
  let p: [number, number, number] = [P[0], P[1], P[2]];
  p = turnAbout(p, F, [fore, 0, 0]);
  p = turnAbout(p, A, arm);
  p = turnAbout(p, PIV.chest, [chest, 0, 0]);
  return [p[0], p[1] - SIT_DROP, p[2]];
}

/** `p` turned about `pivot` by the Euler angles `r` (applied z, then x, then y: the shader's `pEuler`). */
function turnAbout(p: [number, number, number], pivot: readonly number[], r: readonly [number, number, number]): [number, number, number] {
  let x = p[0] - pivot[0];
  let y = p[1] - pivot[1];
  let z = p[2] - pivot[2];
  // z: x' = c x − s y, y' = s x + c y
  let c = Math.cos(r[2]);
  let s = Math.sin(r[2]);
  [x, y] = [c * x - s * y, s * x + c * y];
  // x: y' = c y − s z, z' = s y + c z
  c = Math.cos(r[0]);
  s = Math.sin(r[0]);
  [y, z] = [c * y - s * z, s * y + c * z];
  // y: x' = c x + s z, z' = −s x + c z
  c = Math.cos(r[1]);
  s = Math.sin(r[1]);
  [x, z] = [c * x + s * z, -s * x + c * z];
  return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

// ── His things (his frame: the seat on the dais's top, +z ahead toward the one kneeling, +x his left) ──

/** The dais, its mat and cushions, the bowl of lustral water, the plate with the ball of red string. */
function daisDef(): RigDef {
  const d = new RigDef();
  const s = BLESS_SEATS[0];
  // (the dais from the wall behind him to `ahead` before him; `half` either side)
  const off = (s.dais.x - s.x) * Math.sin(s.yaw) + (s.dais.z - s.z) * Math.cos(s.yaw);
  const ahead = s.dais.along + off;
  const back = s.dais.along - off;
  const half = s.dais.across;
  const h = s.y - s.floor;
  const zc = (ahead - back) / 2;
  const len = ahead + back;
  // The platform: dark lacquered wood, a gold line along its top edge, a darker plinth.
  d.box([0, -h / 2, zc], [half * 2, h - 0.02, len], C.wood);
  d.box([0, -h + 0.03, zc], [half * 2 + 0.04, 0.06, len + 0.04], C.woodDark);
  d.box([0, -0.025, ahead + 0.005], [half * 2 + 0.01, 0.03, 0.02], C.gold);
  for (const sx of [-1, 1]) d.box([sx * (half + 0.005), -0.025, zc], [0.02, 0.03, len], C.gold);
  // Its wooden step before his left end (`BlessSeat.step`), its top half as high, a gold line along its front edge.
  const st = s.step;
  const sa = (st.x - s.x) * Math.sin(s.yaw) + (st.z - s.z) * Math.cos(s.yaw);
  const sc = (st.x - s.x) * Math.cos(s.yaw) - (st.z - s.z) * Math.sin(s.yaw);
  const sh = st.top - s.floor;
  d.box([sc, -h + sh / 2, sa], [st.across * 2, sh - 0.02, st.along * 2], C.wood);
  d.box([sc, -h + 0.03, sa], [st.across * 2 + 0.04, 0.06, st.along * 2 + 0.04], C.woodDark);
  d.box([sc, -h + sh - 0.015, sa + st.along + 0.005], [st.across * 2 + 0.01, 0.03, 0.02], C.gold);
  // The mat (kantel): cream, a red border and a green line inside it.
  d.box([0, 0.006, zc], [half * 2 - 0.08, 0.012, len - 0.08], C.mat);
  d.box([0, 0.013, ahead - 0.1], [half * 2 - 0.12, 0.004, 0.05], C.matRed);
  d.box([0, 0.013, -back + 0.1], [half * 2 - 0.12, 0.004, 0.05], C.matRed);
  for (const sx of [-1, 1]) d.box([sx * (half - 0.1), 0.013, zc], [0.05, 0.004, len - 0.16], C.matRed);
  d.box([0, 0.014, ahead - 0.18], [half * 2 - 0.3, 0.004, 0.025], C.matGreen);
  // His seat cushion, and the triangular cushion (ខ្នើយ) behind him against the wall, red with gold ends.
  d.box([0, 0.035, -0.05], [0.78, 0.05, 0.72], C.cushion);
  d.box([0, 0.15, -back + 0.2], [0.66, 0.24, 0.3], C.pillow);
  d.box([0, 0.34, -back + 0.13], [0.66, 0.16, 0.16], C.pillow);
  d.box([0, 0.44, -back + 0.08], [0.66, 0.06, 0.06], C.pillow);
  for (const sx of [-1, 1]) {
    d.box([sx * 0.335, 0.15, -back + 0.2], [0.012, 0.24, 0.3], C.gold);
    d.box([sx * 0.335, 0.34, -back + 0.13], [0.012, 0.16, 0.16], C.gold);
  }
  // The bowl of lustral water by his right knee (his right: −x), on its foot; the water, lotus petals on it (sized as
  // the people are: × `PROP`).
  const [bx, bz] = BOWL;
  const k = PROP;
  d.box([bx, 0.02 * k, bz], [0.12 * k, 0.04 * k, 0.12 * k], C.silverDark);
  d.box([bx, 0.05 * k, bz], [0.06 * k, 0.03 * k, 0.06 * k], C.silverDark);
  d.box([bx, 0.11 * k, bz], [0.26 * k, 0.1 * k, 0.2 * k], C.silver);
  d.box([bx, 0.11 * k, bz], [0.2 * k, 0.1 * k, 0.26 * k], C.silver);
  d.box([bx, 0.075 * k, bz], [0.21 * k, 0.04 * k, 0.21 * k], C.silver);
  d.box([bx, 0.165 * k, bz], [0.28 * k, 0.016 * k, 0.28 * k], C.silver);
  d.box([bx, 0.162 * k, bz], [0.22 * k, 0.012 * k, 0.22 * k], C.water);
  d.box([bx + 0.06 * k, 0.17 * k, bz - 0.04 * k], [0.04 * k, 0.008 * k, 0.03 * k], C.petal, { rot: [0, 0.5, 0] });
  d.box([bx - 0.05 * k, 0.17 * k, bz + 0.05 * k], [0.035 * k, 0.008 * k, 0.03 * k], C.petal, { rot: [0, -0.3, 0] });
  d.box([bx - 0.07 * k, 0.17 * k, bz - 0.06 * k], [0.03 * k, 0.008 * k, 0.035 * k], C.petal, { rot: [0, 0.9, 0] });
  // The plate with the ball of red cotton string by his left knee, its end hanging over the rim.
  const [px, pz] = PLATE;
  d.box([px, 0.008 * k, pz], [0.2 * k, 0.016 * k, 0.2 * k], C.silver);
  d.box([px, 0.012 * k, pz], [0.16 * k, 0.012 * k, 0.16 * k], C.silverDark);
  d.box([px, 0.055 * k, pz], [0.085 * k, 0.075 * k, 0.085 * k], C.string);
  d.box([px, 0.055 * k, pz], [0.095 * k, 0.05 * k, 0.06 * k], C.stringDark, { rot: [0, 0.6, 0] });
  d.box([px + 0.06 * k, 0.03 * k, pz + 0.04 * k], [0.11 * k, 0.008 * k, 0.008 * k], C.string, { rot: [0, -0.4, -0.25] });
  return d;
}

/** The sprig resting in the bowl: its leaves and bud in the water, the stem leaning out toward his hand. */
function sprigDef(): RigDef {
  const d = new RigDef();
  const [bx, bz] = BOWL;
  const k = PROP;
  d.box([bx + 0.02 * k, 0.19 * k, bz + 0.01 * k], [0.15 * k, 0.016 * k, 0.12 * k], SPRIG.leaf, { rot: [0, 0.4, 0.15] });
  d.box([bx, 0.2 * k, bz - 0.02 * k], [0.016 * k, 0.1 * k, 0.12 * k], SPRIG.leaf, { rot: [0, 0.4, 0] });
  d.box([bx - 0.03 * k, 0.21 * k, bz + 0.03 * k], [0.06 * k, 0.06 * k, 0.08 * k], SPRIG.bud, { rot: [0.3, 0.4, 0] });
  // (the stem out over the rim, up toward his right hand)
  d.box([bx + 0.11 * k, 0.27 * k, bz - 0.09 * k], [0.022 * k, 0.022 * k, 0.26 * k], SPRIG.stem, { rot: [-0.75, 0.75, 0] });
  return d;
}

/**
 * The bowl and the plate on the dais (his frame, m): the bowl at his right side, by his knee, under where his fist
 * dips the sprig (the people model's `dip` shape, `BLESS_ARM`: the fist at ≈ (−0.47, 0.40, 0.17) model m, the leaves
 * 0.3 below it: × 1.37 on the map); the plate at his left side. (Before him the dais ends a hand past his knees:
 * the one kneeling comes close for the string.)
 */
const BOWL: readonly [number, number] = [-0.66, 0.22];
const PLATE: readonly [number, number] = [0.64, 0.2];
/** His things are sized as the people are (1.4 × true: people/_personModel.ts `PEOPLE_SCALE`). */
const PROP = 1.4;
