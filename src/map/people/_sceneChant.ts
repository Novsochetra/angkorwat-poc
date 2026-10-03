import { Vector3, type Object3D } from 'three';
import { eventsNow } from '../events';
import { pagodaLook } from '../festival/_pagodaFolk';
import { festivalNow } from '../festival/_schedule';
import { CHANT_CYCLE, CHANT_FOLK, CHANT_ROW, CHANT_SEAT, CHANT_VERSES, FEST_ROW, HALL_ASK, LISTEN } from '../roam/_listenHooks';
import type { MapFrame } from '../types';
import type { WordKey } from '../ui/lang';
import { PAGODA } from '../village/_spots';
import { Actor, wrap } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { POSE } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { villageGround } from './_sceneVillage';
import { Rig, RigDef } from './_things';

/**
 * The dawn chant in the floating village pagoda's hall (សូត្រមន្តពេលព្រលឹម:
 * events.ts `dawnChant`, the sound audio/temple.ts): four monks sit
 * cross-legged in a row on their low platform before the offering table
 * (`CHANT_SEAT`: one kneeling behind them keeps his head below theirs), facing
 * the Buddha, palms together (`POSE.chant`), and chant the morning's Pali — the homage, the three
 * refuges, the praise of the Buddha, loving-kindness (the lead monk's bubbles,
 * while the explorer is in the hall); three villagers (a lay nun in white, a
 * grandmother, a grandfather) kneel behind them on the mats, palms together.
 * The explorer kneels behind them to listen (roam/_listen.ts; the link
 * `LISTEN`: roam/_listenHooks.ts).
 *
 * - **Coming and going**: as the chant's hour begins they come in by the hall's
 *   door — the villagers first from the west end of the porch, then the monks
 *   from the east in single file up the red carpet, the outer seats first,
 *   stepping up onto the platform — and sit; when it ends they bow three times
 *   (their heads), get up and walk out the way they came, the monks first. Out
 *   of sight they are simply there, or gone; never in the middle of the
 *   camera's view. One in their way (the explorer standing on the carpet) is
 *   walked round: a point they come no nearer to for a moment, within a metre or
 *   so, counts as reached.
 * - **On the pagoda's festival days** (`FEST_ROW`): at Pchum Ben they chant in
 *   the lit hall before dawn while the people walk round it (then they sit on
 *   the porch with the families: festival/_pchumBen.ts), at Visak Bochea at dawn
 *   once the night's procession is over. The blessing monk (_sceneBlessing.ts)
 *   comes to his dais after the chant (`BLESS_HOURS`).
 * - **A little longer while he is with them**: once the hour is over, the row
 *   chants on while the explorer is in the hall or kneels with them, up to
 *   `OVERTIME` s (a day of the cycle is 6 minutes: the hour alone is half a
 *   minute), then ends.
 *
 * URL (checks): `chantrow=1` the row chanting whatever the clock (`0`: never);
 * `chantrow=in:<s>` that far into coming in, `end:<s>` into the bows,
 * `out:<s>` into going out; `chantverse=<s>` the verses' clock (held there in a
 * still). The
 * explorer: roam/_listen.ts (`listen=`).
 */

/** Paces: every frame within this of the camera (m); hidden past this. */
const PACE_NEAR = 60;
const PACE_HIDE = 220;
/** Seen by the camera: within this (m) and inside this cone round its view (cos of the angle). */
const SEEN_NEAR = 34;
const SEEN_CONE = Math.cos((62 * Math.PI) / 180);
/** Walking (m/s); sitting down or getting up (s); stepping up onto the platform or down (s); a monk's palms come together this long after he sits (s). */
const PACE = 0.72;
const RISE_T = 0.75;
const STEP_T = 0.9;
const PALMS_AFTER = 0.9;
/** On the way: a point counts as reached within `THERE` m, or within `NEAR` m once no nearer for `STALL` s (someone in the way), or after `GIVE_UP` s of no nearer. */
const THERE = 0.2;
const NEAR = 1.2;
const STALL = 1.5;
const GIVE_UP = 6;
/** Coming in: the villagers one after another (s apart), the monks after them; going out, the monks first, the villagers after. */
const FOLK_GAP = 1.3;
const MONKS_AFTER = 2.6;
const MONK_GAP = 1.6;
const FOLK_OUT_AFTER = 4.5;
/** The chanting's end: the bows (three nods of the head) over this long (s), then they get up. */
const END_FOR = 5.2;
/** After the hour, while he is in the hall or listens: on for this long at most (s). */
const OVERTIME = 75;
/** The lead monk's verse bubbles show while the explorer is within this of the row (m) and in the hall. */
const TALK_NEAR = 9;

const X = CHANT_ROW.axis;
const F = CHANT_ROW.floor;
/** The porch: its walk behind the door's wall (z), the door's middle, the porch's ends beside the door (hidden from the hall). */
const PORCH_Z = 98.4;
const DOOR_Z = PAGODA.doorZ + 0.8;
const SIDE = 2.4;
const END = 4.2;
/** The carpet's line (the monks' aisle), and where they turn off it to the row. */
const AISLE = 0.25;

type Life = 'gone' | 'wait' | 'walk' | 'stepUp' | 'sit' | 'seated' | 'rise' | 'stepDown' | 'walkOut' | 'out';
type Phase = 'gone' | 'coming' | 'chant' | 'end' | 'leaving';

interface Sitter {
  readonly a: Actor;
  readonly monk: boolean;
  /** A monk's seat in the row (`CHANT_ROW.x`), −1 a villager. */
  readonly seat: number;
  /** The way in (floor points, m: from the porch to the place), the place and the facing. */
  readonly way: Point[];
  readonly sx: number;
  readonly sz: number;
  /** When it sets off coming in and going out (s after the row does). */
  readonly inAt: number;
  outAt: number;
  life: Life;
  lt: number;
  leg: number;
  /** Its own wait before setting off (s). */
  wait: number;
  /** The nearest it has come to the point it walks to (m), and for how long no nearer (s). */
  best: number;
  since: number;
  /** Where it was and the way it faced as it began to sit down or to step up (it is eased onto its place from there). */
  fx: number;
  fz: number;
  fyaw: number;
}

export class ChantRow implements PeopleScene {
  readonly name = 'chant';
  readonly actors: Actor[] = [];
  private readonly pace = new Pace(PACE_NEAR, PACE_HIDE);
  private readonly people: Sitter[] = [];
  private readonly bubble = new Bubble();
  private bubbleUntil = -1e9;
  private saying: WordKey | null = null;
  private phase: Phase = 'gone';
  /** Seconds into the phase; the verses' clock; the time chanted after the hour. */
  private pt = 0;
  private chantT = 0;
  private over = 0;
  private shown = false;
  /** The lead monk (his bubbles), where his head is. */
  private readonly lead: Actor;
  private readonly head = { x: 0, y: 0, z: 0 };
  private readonly headAt = () => this.head;
  private readonly cam = new Vector3();
  /** `chantrow=` (a check): the row there (true), never (false), or by the hour (null); a phase that far in. */
  private readonly urlRow: boolean | null;
  private readonly urlPhase: { phase: 'in' | 'end' | 'out'; t: number } | null;
  private readonly urlVerse: number;
  private urlDone = false;
  /** A headless still (not a video's frames): the bubble stays for the picture. */
  private readonly still: boolean;
  /** A check's `__chant.end()`: the hour is over now (no time after it), until they have gone. */
  private forceEnd = false;
  /** Chanting for Pchum Ben (its own chant is heard: `LISTEN.row.festival`). */
  private festival = false;
  /** The monks' platform (always there, as the blessing monk's dais). */
  private readonly platform: Rig;

  constructor(
    private readonly env: PeopleEnv,
    scene: Object3D,
  ) {
    const ground = villageGround(env, scene);
    this.platform = new Rig(env.things, platformDef());
    // The villagers: from the west end of the porch, in by the door, to their places on the mats.
    CHANT_FOLK.forEach((p, k) => {
      const a = new Actor(env.crowd, pagodaLook(p.role, 9300 + k), ground).avoid(env.traffic, this.name);
      const way: Point[] = [
        { x: X - SIDE, y: F, z: PORCH_Z },
        { x: X - AISLE, y: F, z: PORCH_Z },
        { x: X - AISLE, y: F, z: DOOR_Z },
        { x: X - AISLE, y: F, z: 100.6 },
        { x: X + p.x, y: F, z: p.z },
      ];
      this.add(a, -1, way, X + p.x, p.z, k * FOLK_GAP);
    });
    // The monks: from the east end, up the carpet, along the platform's front to their seats, up onto it (the outer ones
    // first, so nobody walks in front of one seated).
    const order = [0, 3, 1, 2];
    order.forEach((s, k) => {
      const x = CHANT_ROW.x[s];
      const a = new Actor(env.crowd, dress('monk', 9320 + s), ground).avoid(env.traffic, this.name);
      const way: Point[] = [
        { x: X + SIDE, y: F, z: PORCH_Z },
        { x: X + AISLE, y: F, z: PORCH_Z },
        { x: X + AISLE, y: F, z: DOOR_Z },
        { x: X + AISLE, y: F, z: CHANT_ROW.front },
        { x: X + x, y: F, z: CHANT_ROW.front },
      ];
      this.add(a, s, way, X + x, CHANT_ROW.z, MONKS_AFTER + k * MONK_GAP);
    });
    // (going out: the inner monks first, then the outer; the villagers after them)
    const outOrder = [2, 1, 3, 0];
    for (const p of this.people) if (p.monk) p.outAt = outOrder.indexOf(p.seat) * MONK_GAP;
    this.people.filter((p) => !p.monk).forEach((p, k) => (p.outAt = FOLK_OUT_AFTER + k * FOLK_GAP));
    // (the lead: the monk at the axis's west, before the left listening place)
    this.lead = this.people.find((p) => p.seat === 1)!.a;
    const q = env.params;
    const r = q.get('chantrow');
    const [ph, at] = (r ?? '').split(':');
    this.urlPhase = ph === 'in' || ph === 'end' || ph === 'out' ? { phase: ph, t: Number(at) || 0 } : null;
    // (ending or going out: no longer wanted, so they go on out)
    this.urlRow = r === null ? null : r !== '0' && ph !== 'end' && ph !== 'out';
    this.urlVerse = Number(q.get('chantverse') ?? NaN);
    this.still = env.shot && q.get('video') !== '1';
    Object.assign(window, {
      __chant: {
        /** The row now: its phase, how far in, the verses' clock, the time after the hour; each of them. */
        now: () => ({
          phase: this.phase,
          pt: +this.pt.toFixed(2),
          chantT: +this.chantT.toFixed(1),
          over: +this.over.toFixed(1),
          people: this.people.map((p) => ({ who: p.monk ? `monk${p.seat}` : 'folk', life: p.life, shown: p.a.shown, x: +p.a.x.toFixed(2), z: +p.a.z.toFixed(2), pose: env.crowd.poseOf(p.a.i) })),
        }),
        /** End the chanting now (the bows, then out), whatever the hour or the URL. */
        end: () => {
          this.forceEnd = true;
        },
      },
    });
  }

  private add(a: Actor, seat: number, way: Point[], sx: number, sz: number, inAt: number): void {
    this.actors.push(a);
    this.people.push({ a, monk: seat >= 0, seat, way, sx, sz, inAt, outAt: 0, life: 'gone', lt: 0, leg: 0, wait: 0, best: Infinity, since: 0, fx: 0, fz: 0, fyaw: 0 });
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const row = LISTEN.row;
    const step = this.pace.step(dt, viewDist(f, X, PAGODA.z));
    if (step < 0) {
      this.hideAll(f);
      // (far off: nobody to listen; not written, so the pagoda's chant goes by the hour, audio/temple.ts)
      row.there = row.chanting = row.ending = row.coming = row.leaving = false;
      return;
    }
    if (step === 0 && this.shown) {
      this.talk(dt, now, f);
      return;
    }
    dt = step;
    const first = !this.shown;
    this.shown = true;
    this.platform.place(X, F, (CHANT_SEAT.z0 + CHANT_SEAT.z1) / 2, 0).write();
    const want = this.want(dt, f, ex);
    if (first && this.urlPhase && !this.urlDone) this.fromUrl(now, f);
    else this.live(dt, now, f, want, first);
    for (const p of this.people) this.stepOne(p, dt, now, f);
    this.verses(dt, now, f, ex);
    row.there = this.phase === 'chant';
    row.chanting = this.phase === 'chant' || this.phase === 'end';
    row.ending = this.phase === 'end';
    row.coming = this.phase === 'coming';
    row.leaving = this.phase === 'leaving';
    row.festival = this.festival;
    row.chantT = this.chantT;
    row.t = f.t;
    this.talk(dt, now, f);
  }

  // ── When: the hour, the festivals, the explorer with them ──

  private want(dt: number, f: MapFrame, ex: Obstacle | null): boolean {
    if (this.forceEnd) {
      if (this.phase === 'gone') this.forceEnd = false;
      return false;
    }
    if (this.urlRow !== null) return this.urlRow;
    const fest = festivalNow(f);
    this.festival = fest === 'pchumben';
    const c = f.clock - Math.floor(f.clock);
    const hour = fest === 'pchumben' ? c >= FEST_ROW.pchumben[0] && c < FEST_ROW.pchumben[1] : eventsNow(f).on.dawnChant && (fest !== 'visak' || (c >= FEST_ROW.visakFrom && c < 0.95));
    if (hour) {
      this.over = 0;
      return true;
    }
    // (the hour is over: on a little longer while he is in the hall or kneels with them)
    const ask = LISTEN.ask;
    const his = (ask.who === 'row' && ask.state !== 'none') || this.inHall(ex);
    if ((this.phase === 'chant' || this.phase === 'coming') && his && this.over < OVERTIME) {
      this.over += dt;
      return true;
    }
    return false;
  }

  private inHall(ex: Obstacle | null): boolean {
    return !!ex && Math.abs(ex.y - F) < 1.5 && Math.abs(ex.x - X) < HALL_ASK.x + 0.2 && ex.z > PAGODA.doorZ && ex.z < 112.5;
  }

  // ── The row's day: coming in, chanting, the bows, going out ──

  private live(dt: number, now: number, f: MapFrame, want: boolean, first: boolean): void {
    this.pt += dt;
    // (out of sight, or a still's first look: they are simply there, or not)
    if (first || !this.seen(f)) {
      if (want && this.phase !== 'chant' && this.phase !== 'end') this.allSeated(now);
      else if (!want && this.phase !== 'gone' && this.phase !== 'end') this.allGone();
      if (this.phase !== 'end') return;
    }
    switch (this.phase) {
      case 'gone':
        if (want) this.comeIn(now, f);
        break;
      case 'coming':
        if (!want) this.goOut(true);
        else if (this.people.every((p) => p.life === 'seated' && p.lt >= PALMS_AFTER)) this.go('chant');
        break;
      case 'chant':
        if (!want) this.go('end');
        break;
      case 'end':
        // (wanted again, the clock turned back: chanting on)
        if (want) this.go('chant');
        else if (this.pt >= END_FOR) this.goOut(false);
        break;
      case 'leaving':
        if (this.people.every((p) => p.life === 'gone')) this.go('gone');
        break;
    }
  }

  private go(p: Phase): void {
    if (p === 'chant' && this.phase !== 'end') this.chantT = 0;
    this.phase = p;
    this.pt = 0;
  }

  /** Coming in: each from its end of the porch (one hidden from the camera), after its wait. */
  private comeIn(now: number, f: MapFrame): void {
    // (the porch beside the door, else its far end, whichever the camera does not see, each side: or they wait)
    const from: Point[] = [];
    for (const s of [-1, 1]) {
      const near = { x: X + s * SIDE, y: F, z: PORCH_Z };
      const far = { x: X + s * END, y: F, z: PORCH_Z };
      const p = !this.seenAt(f, near) ? near : !this.seenAt(f, far) ? far : null;
      if (!p) return;
      from.push(p);
    }
    for (const p of this.people) {
      const s = from[p.way[0].x < X ? 0 : 1];
      p.wait = p.inAt;
      p.leg = s.x === p.way[0].x ? 1 : 0;
      p.a.warp(s.x, F, s.z, s.x > X ? -Math.PI / 2 : Math.PI / 2);
      p.a.hide();
      p.life = 'wait';
      p.lt = 0;
      p.a.pose(POSE.stand, now);
    }
    this.go('coming');
  }

  /** Going out: each gets up after its wait (`back`: coming in still, turned back at once) and walks out the way it came. */
  private goOut(back: boolean): void {
    for (const p of this.people) {
      p.wait = back ? 0 : p.outAt;
      p.lt = 0;
      if (p.life === 'seated' || p.life === 'sit' || p.life === 'stepUp') p.life = 'rise';
      else if (p.life === 'walk') {
        p.life = 'walkOut';
        p.leg = Math.max(0, p.leg - 1);
      } else if (p.life === 'wait') {
        p.life = 'gone';
        p.a.hide();
      }
    }
    this.go('leaving');
  }

  /** Everyone in their places at once (out of sight, a still), chanting. */
  private allSeated(now: number): void {
    for (const p of this.people) {
      p.a.ride(p.sx, seatY(p), p.sz, CHANT_ROW.yaw);
      p.a.show();
      const pose = p.monk ? POSE.chant : POSE.kneel;
      p.a.pose(pose, now);
      this.env.crowd.pose(p.a.i, pose, now, true);
      p.a.performing = true;
      p.life = 'seated';
      p.lt = PALMS_AFTER;
    }
    if (this.phase !== 'chant') this.go('chant');
    // (a still's verses where the URL puts them, else from a moment in)
    if (Number.isFinite(this.urlVerse)) this.chantT = this.urlVerse;
  }

  /** Everyone gone at once (out of sight). */
  private allGone(): void {
    for (const p of this.people) {
      p.a.hide();
      p.a.performing = false;
      p.life = 'gone';
    }
    this.go('gone');
  }

  /** `chantrow=in|end|out:<s>`: that far into coming in, the bows, going out (a still's first look). */
  private fromUrl(now: number, f: MapFrame): void {
    this.urlDone = true;
    const u = this.urlPhase!;
    if (u.phase === 'in') {
      this.phase = 'gone';
      // (from the porch beside the door, whatever the camera sees)
      for (const p of this.people) {
        p.wait = p.inAt;
        p.leg = 1;
        p.a.warp(p.way[0].x, F, p.way[0].z, Math.PI / 2);
        p.a.hide();
        p.life = 'wait';
        p.lt = 0;
        p.a.pose(POSE.stand, now);
      }
      this.go('coming');
    } else {
      this.allSeated(now);
      this.go('end');
      if (u.phase === 'out') this.goOut(false);
    }
    // (run it up to `t`, as the frames would)
    for (let k = 0, n = Math.round(u.t / 0.05); k < n; k++) {
      this.live(0.05, now, f, u.phase === 'in', false);
      for (const p of this.people) this.stepOne(p, 0.05, now, f);
    }
  }

  // ── One of them ──

  private stepOne(p: Sitter, dt: number, now: number, f: MapFrame): void {
    const a = p.a;
    p.lt += dt;
    switch (p.life) {
      case 'gone':
        return;
      case 'wait':
        if (p.lt < p.wait) return;
        a.show();
        a.pose(POSE.stand, now);
        p.life = 'walk';
        p.lt = 0;
        break;
      case 'walk': {
        const w = p.way[p.leg];
        a.goTo(w.x, w.z, PACE);
        a.face(null);
        if (this.reached(p, w.x, w.z, dt)) {
          if (p.leg < p.way.length - 1) p.leg++;
          else {
            // At the place: a monk steps up onto the platform to his seat; a villager kneels down on the mat (turned to
            // the Buddha, eased onto her place from as near as she came).
            p.fx = a.x;
            p.fz = a.z;
            p.fyaw = a.yaw;
            p.lt = 0;
            a.ride(a.x, a.y, a.z, a.yaw);
            a.performing = true;
            if (p.monk) p.life = 'stepUp';
            else {
              a.pose(POSE.kneel, now);
              p.life = 'sit';
            }
          }
        }
        break;
      }
      case 'stepUp': {
        // Up onto the platform (a little hop), turning to the Buddha, to his seat; then he sits down.
        const u = smooth(Math.min(1, p.lt / STEP_T));
        const hop = Math.sin(Math.PI * u) * 0.12;
        a.ride(p.fx + (p.sx - p.fx) * u, F + (CHANT_SEAT.top - F) * u + hop, p.fz + (p.sz - p.fz) * u, p.fyaw + wrap(CHANT_ROW.yaw - p.fyaw) * u);
        if (p.lt >= STEP_T) {
          a.pose(POSE.sit, now);
          p.fx = p.sx;
          p.fz = p.sz;
          p.fyaw = CHANT_ROW.yaw;
          p.life = 'sit';
          p.lt = 0;
        }
        break;
      }
      case 'sit': {
        const u = smooth(Math.min(1, p.lt / RISE_T));
        a.ride(p.fx + (p.sx - p.fx) * u, seatY(p), p.fz + (p.sz - p.fz) * u, p.fyaw + wrap(CHANT_ROW.yaw - p.fyaw) * u);
        if (p.lt >= RISE_T) {
          p.life = 'seated';
          p.lt = 0;
        }
        break;
      }
      case 'seated': {
        a.ride(p.sx, seatY(p), p.sz, CHANT_ROW.yaw);
        // (a monk's palms together once the row chants: each a moment after he sits)
        const chanting = this.phase === 'chant' || this.phase === 'end' || this.phase === 'coming';
        if (p.monk) a.pose(chanting && p.lt >= PALMS_AFTER ? POSE.chant : POSE.sit, now);
        break;
      }
      case 'rise':
        if (p.lt < p.wait) {
          // (waiting for the one before to go: the chanting over, a monk's hands back on his knees)
          a.ride(p.sx, seatY(p), p.sz, CHANT_ROW.yaw);
          a.pose(p.monk ? POSE.sit : POSE.kneel, now);
          return this.stepActor(p, dt, now);
        }
        a.pose(POSE.stand, now);
        a.ride(p.sx, seatY(p), p.sz, CHANT_ROW.yaw);
        if (p.lt >= p.wait + RISE_T) {
          p.lt = p.wait = 0;
          if (p.monk) p.life = 'stepDown';
          else {
            a.warp(p.sx, F, p.sz, CHANT_ROW.yaw);
            a.performing = false;
            p.leg = p.way.length - 2;
            p.life = 'walkOut';
          }
        }
        break;
      case 'stepDown': {
        // Turned round on the platform, then down off its front (a little hop), to walk out.
        const T = STEP_T * 1.5;
        const k = Math.min(1, p.lt / T);
        const turn = smooth(Math.min(1, k / 0.4));
        const u = smooth(Math.max(0, (k - 0.4) / 0.6));
        const hop = Math.sin(Math.PI * u) * 0.12;
        a.ride(p.sx, CHANT_SEAT.top + (F - CHANT_SEAT.top) * u + hop, p.sz + (CHANT_ROW.front - p.sz) * u, CHANT_ROW.yaw + Math.PI * turn);
        if (p.lt >= T) {
          a.warp(p.sx, F, CHANT_ROW.front, CHANT_ROW.yaw + Math.PI);
          a.performing = false;
          p.leg = p.way.length - 2;
          p.life = 'walkOut';
          p.lt = 0;
        }
        break;
      }
      case 'walkOut': {
        if (p.lt < p.wait) break;
        const w = p.way[p.leg];
        a.goTo(w.x, w.z, PACE);
        a.face(null);
        if (this.reached(p, w.x, w.z, dt)) {
          if (p.leg > 0) p.leg--;
          else {
            p.life = 'out';
            p.lt = 0;
          }
        }
        break;
      }
      case 'out': {
        // (at the porch's end: gone once nobody sees it; on along the porch to its far end first if seen there)
        const s = p.way[0];
        a.stop(s.x > X ? Math.PI / 2 : -Math.PI / 2);
        if (!this.seenAt(f, a)) {
          a.hide();
          p.life = 'gone';
          return;
        }
        a.goTo(X + Math.sign(s.x - X) * END, PORCH_Z, PACE);
        break;
      }
    }
    this.stepActor(p, dt, now);
  }

  /** Walking to (x, z): reached it, or as near as it can come (someone in the way: no nearer for a moment). */
  private reached(p: Sitter, x: number, z: number, dt: number): boolean {
    const d = p.a.dist(x, z);
    if (d < p.best - 0.03) {
      p.best = d;
      p.since = 0;
    } else p.since += dt;
    const ok = d < THERE || (p.since > STALL && d < NEAR) || p.since > GIVE_UP;
    if (ok) {
      p.best = Infinity;
      p.since = 0;
    }
    return ok;
  }

  /** The head: down, eyes on the floor before them (a nod at each of the three bows at the end). */
  private stepActor(p: Sitter, dt: number, now: number): void {
    const a = p.a;
    if (p.life === 'seated' || p.life === 'sit' || (p.life === 'rise' && p.lt < p.wait)) {
      a.lookAt(null);
      a.tilt(this.phase === 'end' ? 0.12 + 0.45 * bows(this.pt) : p.monk ? 0.1 : 0.18);
    } else a.tilt(0);
    a.step(dt, now);
  }

  // ── The verses: the lead monk's bubbles while the explorer is with them ──

  private verses(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    // (a still holds the verses' clock where the URL puts it: the people's time runs on before the picture)
    if (this.still && Number.isFinite(this.urlVerse)) this.chantT = this.urlVerse;
    else if (this.phase === 'chant') this.chantT += dt;
    const ask = LISTEN.ask;
    const near = (ask.who === 'row' && ask.state !== 'none') || (this.inHall(ex) && !!ex && Math.hypot(ex.x - this.lead.x, ex.z - this.lead.z) < TALK_NEAR);
    if (this.phase !== 'chant' || !near || f.roam === 'overview') {
      this.quiet(f);
      return;
    }
    const c = this.chantT % CHANT_CYCLE;
    for (const v of CHANT_VERSES) {
      const left = v.at + v.for - c;
      if (c < v.at || left <= 0) continue;
      if (this.saying === v.key && (this.bubble.showing || left < 0.6)) return;
      this.saying = v.key;
      this.placeHead();
      const len = this.still ? left + 5 : left;
      this.bubble.say(v.key, this.headAt, len);
      this.bubbleUntil = now + len + 0.6;
      return;
    }
  }

  private placeHead(): void {
    const a = this.lead;
    this.head.x = a.x;
    // (seated on the floor: over his head as the blessing monk's on his dais, _sceneBlessing.ts)
    this.head.y = a.y + 1.42 * this.env.crowd.scale(a.i);
    this.head.z = a.z;
  }

  /** His words over his head while they last, then gone for good. */
  private talk(dt: number, now: number, f: MapFrame): void {
    if (this.bubbleUntil <= now) {
      this.quiet(f);
      return;
    }
    this.placeHead();
    this.bubble.update(dt, f.camera, f.roam !== 'overview');
  }

  private quiet(f: MapFrame): void {
    if (this.bubbleUntil === -1e9) return;
    this.bubbleUntil = -1e9;
    this.saying = null;
    this.bubble.update(1, f.camera, false);
  }

  // ── Seen by the camera ──

  /** The camera sees the hall's middle or one of them walking: they walk rather than appear or vanish. */
  private seen(f: MapFrame): boolean {
    if (this.seenAt(f, { x: X, y: F, z: 103.5 })) return true;
    for (const p of this.people) if (p.life !== 'gone' && p.life !== 'wait' && this.seenAt(f, p.a)) return true;
    return false;
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
    // (and nothing solid between: the hall's walls hide the porch from inside)
    const w = this.lead.ground.walk;
    return !w || w.clearance(c.x, c.y, c.z, p.x, p.y + 1.2, p.z) > 0.97;
  }

  private hideAll(f: MapFrame): void {
    this.quiet(f);
    if (!this.shown) return;
    this.shown = false;
    for (const p of this.people) {
      p.a.hide();
      p.a.performing = false;
      p.life = 'gone';
    }
    this.phase = 'gone';
    this.pt = 0;
  }

  report(traffic: Traffic): void {
    for (const p of this.people) if (p.a.shown) traffic.add(this.name, p.a.x, p.a.y, p.a.z);
  }
}

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** A seated one's height: a monk on the platform, a villager on the floor (m). */
const seatY = (p: Sitter): number => (p.monk ? CHANT_SEAT.top : F);

/**
 * The monks' platform (`CHANT_SEAT`), in its frame (placed at the floor under its middle, facing the Buddha): dark
 * lacquered wood, a darker plinth, a gold line along its front and ends, a kantel mat with a red border and a seat
 * cushion under each monk.
 */
function platformDef(): RigDef {
  const d = new RigDef();
  const P = CHANT_SEAT;
  const h = P.top - F;
  const w = P.half * 2;
  const len = P.z1 - P.z0;
  const zc = (P.z0 + P.z1) / 2;
  d.box([0, h / 2, 0], [w, h - 0.02, len], 0x5a2e1e);
  d.box([0, 0.03, 0], [w + 0.04, 0.06, len + 0.04], 0x43221a);
  d.box([0, h - 0.025, -len / 2 - 0.005], [w + 0.01, 0.03, 0.02], 0xc9a24a);
  for (const sx of [-1, 1]) d.box([sx * (P.half + 0.005), h - 0.025, 0], [0.02, 0.03, len], 0xc9a24a);
  d.box([0, h + 0.006, 0], [w - 0.08, 0.012, len - 0.08], 0xe6d6ab);
  d.box([0, h + 0.013, -len / 2 + 0.07], [w - 0.12, 0.004, 0.04], 0xa8322a);
  d.box([0, h + 0.013, len / 2 - 0.07], [w - 0.12, 0.004, 0.04], 0xa8322a);
  for (const sx of [-1, 1]) d.box([sx * (P.half - 0.07), h + 0.013, 0], [0.04, 0.004, len - 0.14], 0xa8322a);
  for (const x of CHANT_ROW.x) d.box([x, h + 0.035, CHANT_ROW.z - zc], [0.7, 0.05, 0.6], 0x7a2420);
  return d;
}
/** Three bows of the head over the end's first 4.2 s (0 up ‥ 1 down). */
function bows(t: number): number {
  const k = t / 1.4;
  const i = Math.floor(k);
  if (i >= 3 || t < 0) return 0;
  const u = k - i;
  return u < 0.45 ? smooth(u / 0.45) : 1 - smooth((u - 0.45) / 0.55);
}
