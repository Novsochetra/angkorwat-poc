import { EV_HOMES, evStair, evToWorld, type EvHome } from '../hamlet/_evSpots';
import { SFX } from '../audio/addonSfx';
import { ALMS_ON, ALMS_START, ALMS_WAY, DAK, inClock, nearWay, type AlmsMonk } from '../roam/_dakBatHooks';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look } from './_personModel';
import { Route, type Obstacle, type Point, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { Rig, RigDef, type Things } from './_things';

/**
 * Dak bat (ដាក់បាត្រ) in the sugar-palm village: at dawn three monks (an
 * elder in front, a monk, a novice at the back) walk barefoot in a line in
 * their saffron robes, their alms bowls held at the belly, up the palm lane
 * and west along the village street to the market's corner (`ALMS_WAY`,
 * roam/_dakBatHooks.ts). Families wait by the road in front of two houses
 * (n3, its grandmother, daughter and granddaughter; s1, an old couple and
 * their son), standing on a mat with a woven tray of rice and lotus; the
 * monks stop before them and turn to them, lift the lids of their bowls
 * (`AlmsBowl`: the person model's bowl is one closed box, so while it is
 * open the people's things draw it), each family member puts rice into a
 * bowl (`give`), the lids go back on, and the givers kneel with their palms
 * together while the monks chant a short blessing (heads bowed: the
 * `dakChant` sound, audio/_dakbat.ts); then the monks walk on and the
 * family goes back in.
 *
 * The explorer gives too (roam/_dakBat.ts, `DAK.ask`): kneeling by the
 * road as the line comes, the first monk not past him yet steps out of the
 * line to stand before him, the others wait; he lifts his lid, the rice
 * goes in, the lid goes back on, the monks bless him, and the monk steps
 * back into the line. The monks write where they are into their `DAK`
 * slots each step (line `alms`).
 *
 * When: the line sets out as the clock passes `ALMS_START` (once a
 * morning), walks for about 75 s of play (≈ 0.2 of the map's day: it is on
 * the way over `ALMS_ON`, the calendar's window); where the clock stands
 * still in the morning (a shot, `clock=`) it goes round again after a
 * rest. A page that opens (or a camera that comes back) mid-round finds it
 * where it would be by now (`timeline`).
 *
 * Shots: `clock=0.78` (on the way; `0.76` it comes up the lane), with
 * `dakbat=1` and `at=` near the way the line comes up to him (≈ 7 m off);
 * `almsstop=0|1` holds it at that family's stop (the giving; `almsstop=0:bless`
 * the blessing).
 */

/** The line's name in `DAK` (roam/_dakBatHooks.ts). */
export const ALMS_LINE = 'alms';
/** Monks in the line, the gap between them (m along the way), their pace (m/s; barefoot, steady). */
const MONKS = 3;
const GAP = 1.6;
const SPEED = 0.85;
/** The way's end hides them this far before it (m): they walk on into the market's crowd. */
const END_EARLY = 0.2;
/**
 * A halt: settling in front of the givers (s: at least, at most; the timeline allows `SETTLE_T`), the bowls out in
 * both hands and their lids up (`Receiving`: `OUT` + `LID_UP`), the giving, the lids back on and the bowls back
 * (`LID_DOWN` + `OUT`), the blessing.
 */
const SETTLE = [0.9, 4.0] as const;
const SETTLE_T = 2.0;
const OUT = 0.55;
const LID_UP = 0.45;
const GIVE = 2.1;
const LID_DOWN = 0.4;
const BLESS = 5.8;
const OPEN_T = OUT + LID_UP;
const CLOSE_T = LID_DOWN + OUT;
/** The whole halt (s), for the timeline; when each step of it begins. */
const HALT = SETTLE_T + OPEN_T + GIVE + CLOSE_T + BLESS;
const AT = { open: SETTLE_T, give: SETTLE_T + OPEN_T, close: SETTLE_T + OPEN_T + GIVE, bless: SETTLE_T + OPEN_T + GIVE + CLOSE_T } as const;
/** Between a giver and the monk before them (m, feet to feet): her tray reaches his bowl, held out (`HELD`). */
const GIVER_STAND = 1.2;
/** Where the clock stands still in the morning, the round goes again after this rest (s). */
const AGAIN = 40;
/** The pace by distance from the camera (m): every frame near, hidden beyond. */
const NEAR = 180;
const HIDE = 420;
/** Givers walk at this pace (m/s); they come out when the line is this far off along the way (m), go in this far past (m). */
const GIVER_WALK = 0.7;
const COME_OUT = 60;
const GO_IN = 5;
/** A bowl's lid fully open (radians about the bowl's front axis: it stands up on the monk's right, in his hand). */
const LID_OPEN = 1.75;
/** The monk's head bowed while chanting (Actor `tilt`). */
const CHANT_TILT = 0.38;

// ── A monk's bowl, open ──────────────────────────────────────────────────────

const RICE = 0xf4f1e8;
/** The bowl's middle at his belly (the person model's), and out in both hands in the `give` pose (its fists at ±0.1, 0.77, 0.37). */
const BELLY = { y: 0.675, z: 0.25 };
const HELD = { y: 0.8, z: 0.37 };
const INSIDE = 0x0c0a09;
const shade = (hex: number, k: number): number => {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
};

/** A look without the alms bowl (its own bowl is drawn while open): the same person, the same arms. */
export function withoutBowl(look: Look): Look {
  return { ...look, feats: look.feats.filter((f) => f !== FEAT.bowl) };
}

/**
 * A monk's alms bowl with its lid, as the person model draws it
 * (_personModel.ts: the bowl on the chest at the belly, its lid, the gilt
 * knob, the sling's strap) but made of the people's things, so its lid can
 * lift and the rice show. Shown in place of the model's own (`withoutBowl`)
 * while the monk stands still: at rest the chest hardly moves, so it stays
 * in his hands. Eight thing boxes.
 */
export class AlmsBowl {
  private readonly rig: Rig;
  private readonly rice: number;
  private readonly strap: number;
  constructor(
    private readonly things: Things,
    look: Look,
  ) {
    const def = new RigDef();
    const gear = look.colors[SLOT.gear];
    def.box([0, 0.675, 0.25], [0.3, 0.17, 0.26], gear);
    def.box([0, 0.7615, 0.25], [0.25, 0.004, 0.21], INSIDE);
    // (the lid turns about its edge on the monk's right, the knob with it)
    const lid = def.part([-0.12, 0.77, 0.25]);
    def.box([0, 0.77, 0.25], [0.24, 0.04, 0.2], gear, { part: lid });
    def.box([0, 0.795, 0.25], [0.06, 0.03, 0.06], look.colors[SLOT.gold], { part: lid });
    // (a lighter rim under the lid, seen as it lifts)
    def.box([0, 0.752, 0.25], [0.236, 0.004, 0.196], shade(gear, 1.8), { part: lid });
    this.rig = new Rig(things, def);
    this.rice = things.alloc(1);
    things.paint(this.rice, RICE);
    // (the sling's strap stays on his chest when the bowl goes out in his hands)
    this.strap = things.alloc(1);
    things.paint(this.strap, look.colors[SLOT.accent]);
  }

  /**
   * On monk `a` (standing, or in the `give` pose: `held` 1, the bowl out in both hands, `HELD`), the lid `open` (0
   * shut ‥ 1 up), the rice `fill` (0 ‥ 1).
   */
  show(a: Actor, open: number, fill: number, held: number): void {
    const k = a.crowd.scale(a.i);
    const s = Math.sin(a.yaw);
    const c = Math.cos(a.yaw);
    const dy = (HELD.y - BELLY.y) * held * k;
    const dz = (HELD.z - BELLY.z) * held * k;
    this.rig.place(a.x + s * dz, a.y + dy, a.z + c * dz, a.yaw, 0, 0, k).turn(1, 0, 0, open * LID_OPEN).write();
    // (the strap on his chest, a little more over it as he leans to hold the bowl out)
    this.things.put(this.strap, a.x + s * (0.149 + 0.02 * held) * k + c * 0.13 * k, a.y + 0.9 * k, a.z + c * (0.149 + 0.02 * held) * k - s * 0.13 * k, 0.04 * k, 0.18 * k, 0.012 * k, a.yaw);
    if (fill > 0.01 && open > 0.08) {
      const h = (0.014 + 0.05 * fill) * k;
      this.things.put(this.rice, a.x + s * (0.25 * k + dz), a.y + 0.7615 * k + dy + h / 2, a.z + c * (0.25 * k + dz), (0.13 + 0.08 * fill) * k, h, (0.11 + 0.06 * fill) * k, a.yaw);
    } else this.things.hide(this.rice);
  }

  hide(): void {
    this.rig.hide();
    this.things.hide(this.rice);
    this.things.hide(this.strap);
  }

  /** The bowl's mouth on the map for monk `a` (the top of its middle), held out (`held` 1) or at his belly. */
  static mouth(a: Actor, held: number, out: Point): Point {
    const k = a.crowd.scale(a.i);
    const z = (BELLY.z + (HELD.z - BELLY.z) * held) * k;
    out.x = a.x + Math.sin(a.yaw) * z;
    out.y = a.y + (0.77 + (HELD.y - BELLY.y) * held) * k;
    out.z = a.z + Math.cos(a.yaw) * z;
    return out;
  }
}

/** A monk who can take the explorer's rice (Angkor Wat's, the floating village's): his two looks and his open bowl. */
export class OpenBowl {
  readonly bare: Look;
  readonly bowl: AlmsBowl;
  /** The open bowl shows (the model's own is hidden). */
  own = false;
  lid = 0;
  fill = 0;
  /** Held out in both hands (0 at his belly ‥ 1: the `give` pose). */
  held = 0;
  constructor(things: Things, readonly look: Look) {
    this.bare = withoutBowl(look);
    this.bowl = new AlmsBowl(things, look);
  }

  /** The bowl as drawn: its own (open, still) or the model's (walking). */
  use(a: Actor, own: boolean): void {
    if (own === this.own) return;
    this.own = own;
    const l = own ? this.bare : this.look;
    a.look = l;
    a.crowd.dress(a.i, l);
    if (!own) this.bowl.hide();
  }

  /** Each step while its own shows: the lid and the rice where they are. */
  step(a: Actor): void {
    if (this.own) this.bowl.show(a, this.lid, this.fill, this.held);
  }
}

/**
 * A monk taking alms: his bowl out in both hands (the `give` pose, `held`), its lid up; open while given into;
 * then the lid back on, the bowl back to his belly and the person model's own again (`OpenBowl`). Used for the
 * families' gifts and the explorer's, by every line (people/_monks.ts, _sceneVillage.ts too).
 */
export class Receiving {
  phase: 'idle' | 'out' | 'up' | 'open' | 'down' | 'in' = 'idle';
  private t = 0;
  constructor(readonly ob: OpenBowl) {}

  /** Taking alms or about to (not idle). */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Standing still before the giver: the bowl out, the lid up (`snap`: at once, a check's still). */
  open(a: Actor, now: number, snap = false): void {
    this.ob.use(a, true);
    a.pose(POSE.give, now);
    a.carry(1, now);
    this.phase = snap ? 'open' : 'out';
    this.t = 0;
    if (snap) {
      this.ob.held = 1;
      this.ob.lid = 1;
    }
  }

  /** The lid back on, the bowl back (from wherever it is). */
  close(): void {
    if (this.phase === 'out' || this.phase === 'up' || this.phase === 'open') {
      this.phase = 'down';
      this.t = 0;
    }
  }

  /** At once, model bowl again (he walks on, he is hidden). */
  stop(a: Actor): void {
    this.phase = 'idle';
    this.ob.held = this.ob.lid = 0;
    this.ob.use(a, false);
  }

  step(a: Actor, dt: number, now: number): void {
    const ob = this.ob;
    this.t += dt;
    switch (this.phase) {
      case 'out':
        ob.held = smooth(Math.min(1, this.t / OUT));
        if (this.t >= OUT) {
          this.phase = 'up';
          this.t = 0;
        }
        break;
      case 'up':
        ob.lid = smooth(Math.min(1, this.t / LID_UP));
        if (this.t >= LID_UP) this.phase = 'open';
        break;
      case 'open':
        ob.lid = 1;
        ob.held = 1;
        break;
      case 'down':
        ob.lid = 1 - smooth(Math.min(1, this.t / LID_DOWN));
        if (this.t >= LID_DOWN) {
          this.phase = 'in';
          this.t = 0;
          a.pose(POSE.stand, now);
        }
        break;
      case 'in':
        ob.held = 1 - smooth(Math.min(1, this.t / OUT));
        if (this.t >= OUT) {
          // (his hands back on it, the model's own bowl again)
          a.carry(1, now);
          this.stop(a);
        }
        break;
    }
    ob.step(a);
  }
}

// ── The line ────────────────────────────────────────────────────────────────

interface Monk {
  a: Actor;
  b: OpenBowl;
  r: Receiving;
  slot: AlmsMonk;
  /** Where he walks to (or stands at) and faces (null: the way he walks). */
  gx: number;
  gz: number;
  face: number | null;
  /** On his own goal (a halt, the explorer), not his place in the line. */
  aside: boolean;
}

interface Giver {
  a: Actor;
  /** The way out from the stair's foot through the gate to the mat (and back). */
  way: Point[];
  spot: Point & { yaw: number };
  /** The monk who takes from this one. */
  k: number;
  phase: 'home' | 'out' | 'wait' | 'give' | 'kneel' | 'in';
  leg: number;
}

interface Stop {
  home: EvHome;
  givers: Giver[];
  /** Where each monk k stands before his giver, facing them. */
  goals: (Point & { yaw: number })[];
  /** The leader's place along the way when the line halts here. */
  s: number;
  mat: Rig;
  done: boolean;
}

type Phase = 'off' | 'walk' | 'halt' | 'claim';
interface Halt {
  stop: Stop;
  t: number;
  step: 'settle' | 'open' | 'give' | 'close' | 'bless';
}

/** Scratch (no allocation a frame). */
const P: Point & { yaw?: number } = { x: 0, y: 0, z: 0 };
const Q: Point = { x: 0, y: 0, z: 0 };
const EYE: Point = { x: 0, y: 0, z: 0 };

export class AlmsRound implements PeopleScene {
  readonly name = 'alms';
  readonly actors: Actor[] = [];
  private readonly route: Route;
  private readonly monks: Monk[] = [];
  private readonly stops: Stop[] = [];
  private readonly pace = new Pace(NEAR, HIDE);
  /** The leader's place along the way (m). */
  private s = 0;
  private phase: Phase = 'off';
  /** The halt: which stop, how long (s), how far through it. */
  private halt: Halt | null = null;
  /** The explorer's offering: the monk, how far (s), and its step. */
  private claim: { k: number; t: number; step: 'go' | 'settle' | 'open' | 'there' | 'close' | 'bless' | 'back'; n: number; fill0: number; sSpot: number } | null = null;
  /** The ask last answered (`DAK.ask.n`). */
  private taken = -1;
  /** The morning's round has been (a new one waits for the next morning), or a held clock's rest (s). */
  private done = false;
  private rest = 0;
  /** Drawn now (else far off: everyone hidden, and found again from the clock when the camera comes back). */
  private shown = false;
  private stale = true;
  private readonly pins: { stop: number; bless: boolean } | null;
  private chantAt = -1e9;

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground } = env;
    // The way, a point every half metre, on the land.
    const pts: Point[] = [];
    for (let i = 0; i < ALMS_WAY.length - 1; i++) {
      const [ax, az] = ALMS_WAY[i];
      const [bx, bz] = ALMS_WAY[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / Route.STEP));
      for (let j = 0; j < n; j++) {
        const x = ax + ((bx - ax) * j) / n;
        const z = az + ((bz - az) * j) / n;
        pts.push({ x, y: ground.field.heightAt(x, z), z });
      }
    }
    const [lx, lz] = ALMS_WAY[ALMS_WAY.length - 1];
    pts.push({ x: lx, y: ground.field.heightAt(lx, lz), z: lz });
    this.route = Route.from(pts);
    // The monks: an elder, a monk, a novice; barefoot.
    for (let k = 0; k < MONKS; k++) {
      const look = dress('monk', 3301 + k * 7, { carry: CARRY.bowl, young: k === MONKS - 1 });
      look.colors[SLOT.sole] = look.colors[SLOT.skin];
      const a = new Actor(crowd, look, ground);
      this.actors.push(a);
      const b = new OpenBowl(env.things, look);
      this.monks.push({ a, b, r: new Receiving(b), slot: DAK.slot(ALMS_LINE, k), gx: 0, gz: 0, face: null, aside: false });
    }
    // The families by the road: n3's grandmother, her daughter and granddaughter; s1's old couple and their son.
    const families: [string, Look[]][] = [
      ['n3', [giverLook('villager', 3401, { sex: 'f', age: 'old', hat: 'none' }), giverLook('villager', 3403, { sex: 'f', hat: 'none' }), giverLook('kid', 3405, {})]],
      ['s1', [giverLook('villager', 3411, { sex: 'm', age: 'old', hat: 'krama' }), giverLook('villager', 3413, { sex: 'f', age: 'old', hat: 'none' }), giverLook('villager', 3415, { sex: 'm', hat: 'none' })]],
    ];
    for (const [id, looks] of families) {
      const home = EV_HOMES.find((h) => h.id === id);
      if (home) this.stops.push(this.stopAt(home, looks));
    }
    this.stops.sort((p, q) => p.s - q.s);
    const pin = env.params.get('almsstop');
    this.pins = pin === null ? null : { stop: Math.max(0, Math.min(this.stops.length - 1, Number(pin.split(':')[0]) || 0)), bless: pin.endsWith(':bless') };
    const at = (p: Point) => `${p.x.toFixed(1)},${p.z.toFixed(1)}`;
    console.info(`[map] alms round: ${MONKS} monks, ${this.route.len.toFixed(0)} m, ${this.length.toFixed(0)} s · stops ${this.stops.map((st) => `${st.home.id} ${at(st.givers[0].spot)}‥${at(st.givers[st.givers.length - 1].spot)} (monks ${at(st.goals[0])})`).join(' · ')}`);
  }

  /** A family's stop in front of house `home`: their spots on a mat outside the fence by the gate, the monks' before them. */
  private stopAt(home: EvHome, looks: Look[]): Stop {
    const { crowd, ground, things } = this.env;
    const st = evStair(home);
    const fence = st.footZ + 1.3;
    const matZ = fence + 1.15;
    const g = looks.length;
    const yaw = home.facing;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const spots = looks.map((_, j) => {
      const [x, z] = evToWorld(home, home.stairX + (j - (g - 1) / 2) * GAP, matZ);
      return { x, y: ground.field.heightAt(x, z), z, yaw };
    });
    // (the monks walk the way in order: the first takes from the giver furthest along it)
    const along = spots.map((p) => this.route.nearest(p.x, p.z));
    const order = spots.map((_, j) => j).sort((p, q) => along[q] - along[p]);
    const [sx, sz] = evToWorld(home, home.stairX, st.footZ + 0.3);
    const [gx, gz] = evToWorld(home, home.stairX, fence);
    const givers: Giver[] = looks.map((look, j) => {
      const a = new Actor(crowd, look, ground);
      this.actors.push(a);
      const sp = spots[j];
      const way: Point[] = [
        { x: sx, y: ground.field.heightAt(sx, sz), z: sz },
        { x: gx, y: ground.field.heightAt(gx, gz), z: gz },
        sp,
      ];
      return { a, way, spot: sp, k: order.indexOf(j), phase: 'home', leg: 0 };
    });
    const goals = order.map((j) => {
      const p = spots[j];
      return { x: p.x + fx * GIVER_STAND, y: p.y, z: p.z + fz * GIVER_STAND, yaw: yaw + Math.PI };
    });
    // (the leader halts where his goal is along the way, a little short of it)
    const s = this.route.nearest(goals[0].x, goals[0].z) - 0.3;
    // The family's mat: a woven reed mat along the fence, a silver bowl of rice (ផ្តិល) with its lid and spoon, lotus buds.
    const def = new RigDef();
    const w = g * GAP + 0.5;
    def.box([0, 0.012, 0], [w, 0.024, 0.95], 0xc9ab6c);
    for (let i = 0; i < 5; i++) def.box([0, 0.026, -0.36 + i * 0.18], [w - 0.06, 0.006, 0.05], 0xa8884c);
    def.box([w / 2 - 0.3, 0.09, -0.25], [0.3, 0.14, 0.3], 0xc8ccd2);
    def.box([w / 2 - 0.3, 0.175, -0.25], [0.26, 0.04, 0.26], 0xe2e5ea);
    def.box([w / 2 - 0.3, 0.2, -0.25], [0.05, 0.03, 0.05], 0xd8b048);
    def.box([w / 2 - 0.62, 0.07, -0.28], [0.08, 0.1, 0.08], 0xe88aa8);
    def.box([w / 2 - 0.7, 0.06, -0.2], [0.07, 0.09, 0.07], 0xf0a8c0);
    def.box([w / 2 - 0.66, 0.035, -0.24], [0.2, 0.03, 0.05], 0x5a8a3a);
    const mat = new Rig(things, def);
    const [mx, mz] = evToWorld(home, home.stairX, matZ);
    mat.place(mx, ground.field.heightAt(mx, mz), mz, yaw);
    return { home, givers, goals, s, mat, done: false };
  }

  // ── The clock: when the round goes, and where it is ────────────────────────

  /** How long the whole round takes (s): its walk and its halts. */
  private get length(): number {
    return (this.route.len + (MONKS - 1) * GAP) / SPEED + this.stops.length * HALT;
  }

  /** The leader's place along the way `t` s into the round (the halts held), and the stop he is halted at (or −1). */
  private timeline(t: number): { s: number; at: number; into: number } {
    let s = 0;
    let left = t;
    for (let i = 0; i < this.stops.length; i++) {
      const walk = (this.stops[i].s - s) / SPEED;
      if (left < walk) return { s: s + left * SPEED, at: -1, into: 0 };
      left -= walk;
      s = this.stops[i].s;
      if (left < HALT) return { s, at: i, into: left };
      left -= HALT;
    }
    return { s: s + left * SPEED, at: -1, into: 0 };
  }

  /** Seconds since this morning's round set out, or NaN (none now: not the morning, or it is over). */
  private sinceStart(f: MapFrame): number {
    if (!inClock(f.clock, ALMS_ON)) return NaN;
    const c = f.clock - Math.floor(f.clock);
    const t = (c - ALMS_START[0]) * TIME.dayLength;
    return t >= 0 && t < this.length ? t : NaN;
  }

  /** Set the round where the clock (or a check's pin) says it is now: on the way, halted at a stop, or not out. */
  private begin(f: MapFrame, now: number): void {
    this.stale = false;
    this.claim = null;
    let t = this.sinceStart(f);
    const pin = DAK.pin;
    /** (a check: the line comes up to him from this far along the way, the families before him have given) */
    let pinS = NaN;
    if (pin && inClock(f.clock, ALMS_ON) && nearWay(ALMS_WAY, pin.x, pin.z, 18)) {
      // (about 7 m off once the shot's run-up, ≈ 10 s, has walked it on)
      pinS = this.route.nearest(pin.x, pin.z);
      t = (Math.max(0, pinS - (this.env.shot ? 7 + 10.2 * SPEED : 9))) / SPEED;
    }
    if (this.pins) {
      const st = this.stops[this.pins.stop];
      t = this.timeOf(st.s) + (this.pins.bless ? AT.bless + 1.5 : AT.give + 0.6);
    }
    for (const st of this.stops) {
      st.done = false;
      for (const g of st.givers) {
        g.phase = 'home';
        if (g.a.shown) g.a.hide();
      }
      st.mat.hide();
    }
    if (Number.isNaN(t)) {
      this.off();
      return;
    }
    const at = Number.isNaN(pinS) ? this.timeline(t) : { s: t * SPEED, at: -1, into: 0 };
    this.s = at.s;
    this.phase = 'walk';
    this.halt = null;
    // The families: already out by the road for the stops ahead, in again behind.
    this.stops.forEach((st, i) => {
      const passed = !Number.isNaN(pinS) ? st.s < pinS + 1 : at.at < 0 ? this.s > st.s + 0.5 : i < at.at;
      st.done = passed;
      // (gone in already; a check's pin: they gave before he came, and are in)
      if (passed && (this.s > st.s + GO_IN + MONKS * GAP || !Number.isNaN(pinS))) return;
      for (const g of st.givers) {
        g.phase = 'wait';
        g.leg = 2;
        g.a.warp(g.spot.x, g.spot.y, g.spot.z, g.spot.yaw);
        g.a.show();
        g.a.pose(passed ? POSE.kneel : POSE.stand, now);
        g.a.carry(1, now);
        if (passed) g.phase = 'kneel';
      }
      st.mat.write();
    });
    if (at.at >= 0) this.haltAt(this.stops[at.at], at.into);
    this.done = true;
    // The monks on the way (or at their goals, halted), each in his place.
    for (let k = 0; k < MONKS; k++) {
      const m = this.monks[k];
      const sk = this.s - k * GAP;
      m.r.stop(m.a);
      // (the rice so far: a bowl fills a little at each stop)
      const halt = this.halt as Halt | null;
      m.b.fill = Math.min(1, this.stops.filter((st) => st.done || (halt?.stop === st && halt.step !== 'settle' && halt.step !== 'open')).length * 0.35);
      if (sk < 0 || sk > this.route.len - END_EARLY) {
        if (m.a.shown) m.a.hide();
        continue;
      }
      this.place(m, sk);
      const goal = (this.halt as Halt | null)?.stop.goals[k] ?? null;
      if (goal) {
        m.gx = goal.x;
        m.gz = goal.z;
        m.face = goal.yaw;
        m.aside = true;
      }
      m.a.warp(m.gx, this.env.ground.field.heightAt(m.gx, m.gz), m.gz, m.face ?? this.route.yawAt(Math.max(0, sk)));
      m.a.show();
      m.a.pose(POSE.stand, now);
      m.a.carry(1, now);
    }
    const h = this.halt as Halt | null;
    // (halted mid-gift: the bowls out, open, at once)
    if (h && (h.step === 'open' || h.step === 'give')) for (const m of this.monks) if (m.aside && m.a.shown) m.r.open(m.a, now, true);
  }

  /** Seconds into the round at which the leader is at `s` along the way (walking, halts before it held). */
  private timeOf(s: number): number {
    let t = 0;
    let from = 0;
    for (const st of this.stops) {
      if (st.s >= s) break;
      t += (st.s - from) / SPEED + HALT;
      from = st.s;
    }
    return t + (s - from) / SPEED;
  }

  /** No round now: everyone in. */
  private off(): void {
    this.phase = 'off';
    this.halt = null;
    this.claim = null;
    for (const m of this.monks) {
      m.r.stop(m.a);
      if (m.a.shown) m.a.hide();
      m.slot.on = false;
    }
    for (const st of this.stops) {
      for (const g of st.givers) if (g.a.shown) g.a.hide();
      st.mat.hide();
    }
  }

  // ── Each step ──────────────────────────────────────────────────────────────

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, ALMS_WAY[4][0], ALMS_WAY[4][1]));
    if (step < 0) {
      if (this.shown) this.hideAll();
      return;
    }
    if (step === 0) return;
    dt = step;
    this.shown = true;
    if (this.stale) this.begin(f, now);
    this.serveSnap(now);
    if (this.phase === 'off') {
      // (the next morning; or, where the clock stands still in the morning, after a rest)
      if (!inClock(f.clock, ALMS_ON)) this.done = false;
      else if (!TIME.cycling() && !this.env.shot) {
        this.rest -= dt;
        if (this.rest <= 0) this.start();
      } else if (!this.done && inClock(f.clock, ALMS_START)) this.start();
      this.answerOff();
      return;
    }
    if (this.phase === 'walk') this.walk(dt, now);
    else if (this.phase === 'halt') this.stepHalt(dt, now, f);
    else this.stepClaim(dt, now);
    if ((this.phase as Phase) === 'off') return;
    this.givers(dt, now, ex);
    // Place the monks, their bowls, their slots.
    let allGone = true;
    for (let k = 0; k < MONKS; k++) {
      const m = this.monks[k];
      const sk = this.s - k * GAP;
      if (!m.aside) {
        if (sk < 0 || sk > this.route.len - END_EARLY) {
          if (m.a.shown) {
            m.r.stop(m.a);
            m.a.hide();
          }
          m.slot.on = false;
          if (sk < 0) allGone = false;
          continue;
        }
        this.place(m, sk);
      }
      allGone = false;
      if (!m.a.shown) {
        m.a.warp(m.gx, this.env.ground.field.heightAt(m.gx, m.gz), m.gz, this.route.yawAt(sk));
        m.a.show();
        m.a.pose(POSE.stand, now);
        m.a.carry(1, now);
      }
      m.a.goTo(m.gx, m.gz, m.aside ? 0.7 : SPEED * 1.25);
      m.a.face(m.face);
      m.a.step(dt, now);
      // (greeted meanwhile, he turns his head and nods: the model's own bowl, which moves with him)
      if (m.a.held && m.r.busy) m.r.stop(m.a);
      m.r.step(m.a, dt, now);
      const sl = m.slot;
      sl.on = true;
      sl.x = m.a.x;
      sl.y = m.a.y;
      sl.z = m.a.z;
      sl.yaw = this.route.yawAt(Math.max(0, Math.min(this.route.len, sk)));
      sl.t = f.t;
    }
    if (allGone && this.phase === 'walk') this.finish();
  }

  /** A monk's place in the line at `sk` along the way (his goal, and the way he faces when he gets there). */
  private place(m: Monk, sk: number): void {
    const p = this.route.at(Math.max(0, sk), 0, P);
    m.gx = p.x;
    m.gz = p.z;
    m.face = null;
  }

  private start(): void {
    this.done = true;
    this.s = 0;
    this.phase = 'walk';
    this.halt = null;
    this.claim = null;
    for (const st of this.stops) st.done = false;
    for (const m of this.monks) {
      m.aside = false;
      m.b.fill = 0;
      m.r.stop(m.a);
    }
  }

  /** The round is over: the monks have walked on, the families have gone in. */
  private finish(): void {
    this.off();
    this.rest = AGAIN;
  }

  private walk(dt: number, now: number): void {
    // (walking: heads a little bowed, eyes down, bowls held)
    for (const m of this.monks) {
      m.a.tilt(0.12);
      if (!m.r.busy) m.a.pose(POSE.stand, now);
    }
    // The explorer kneeling to give: the line stops, one monk goes to him.
    const ask = DAK.ask;
    if (ask.line === ALMS_LINE && ask.state === 'ask' && ask.n !== this.taken) {
      this.take();
      if (this.phase === 'claim') return;
    }
    // On to the next family's stop (a few metres before it the leader slows: they come to a calm halt).
    let next: Stop | null = null;
    for (const st of this.stops)
      if (!st.done) {
        next = st;
        break;
      }
    let v = SPEED;
    if (next) {
      const d = next.s - this.s;
      if (d <= 0) {
        this.haltAt(next, 0);
        return;
      }
      v = Math.min(SPEED, 0.3 + d * 0.4);
    }
    // (anyone left behind: they wait)
    let lag = false;
    for (const m of this.monks) if (m.a.shown && !m.aside && m.a.behind > 1.5) lag = true;
    if (!lag) this.s += v * dt;
  }

  /** Halted at `st`, `t` s into it (0: just arriving). */
  private haltAt(st: Stop, t: number): void {
    this.phase = 'halt';
    this.s = st.s;
    const step = t < AT.open ? 'settle' : t < AT.give ? 'open' : t < AT.close ? 'give' : t < AT.bless ? 'close' : 'bless';
    this.halt = { stop: st, t, step };
    for (let k = 0; k < MONKS; k++) {
      const m = this.monks[k];
      const g = st.goals[k];
      if (!g) continue;
      m.gx = g.x;
      m.gz = g.z;
      m.face = g.yaw;
      m.aside = true;
    }
  }

  private stepHalt(dt: number, now: number, f: MapFrame): void {
    const h = this.halt!;
    const st = h.stop;
    // (a check's pin holds the stop where it is)
    if (!this.pins) h.t += dt;
    const ms = this.monks;
    if (h.step === 'settle') {
      let there = true;
      for (const m of ms) if (m.aside && m.a.shown && (m.a.dist(m.gx, m.gz) >= 0.15 || Math.abs(wrap((m.face ?? m.a.yaw) - m.a.yaw)) >= 0.08 || m.a.speed >= 0.02)) there = false;
      if ((there && h.t > SETTLE[0]) || h.t > SETTLE[1]) {
        // Standing before them: the bowls out, the lids up.
        h.step = 'open';
        h.t = AT.open;
        for (const m of ms) if (m.aside && m.a.shown) m.r.open(m.a, now);
      }
    } else if (h.step === 'open') {
      if (h.t >= AT.give) h.step = 'give';
    } else if (h.step === 'give') {
      // The rice goes in (the givers hand it over: their `give`).
      const k = (h.t - AT.give) / GIVE;
      for (const g of st.givers) {
        const m = ms[g.k];
        if (m?.aside && k > 0.25 && k < 0.85) m.b.fill = Math.min(1, m.b.fill + (dt / (GIVE * 0.6)) * 0.35);
      }
      if (h.t >= AT.close) {
        h.step = 'close';
        for (const m of ms) m.r.close();
      }
    } else if (h.step === 'close') {
      if (h.t >= AT.bless) {
        h.step = 'bless';
        for (const m of ms) if (m.r.busy) m.r.stop(m.a);
        this.chant(f, st.goals[1] ?? st.goals[0], now);
      }
    } else if (h.t > HALT) {
      // The blessing over: on along the way.
      st.done = true;
      this.halt = null;
      this.phase = 'walk';
      for (const m of ms) m.aside = false;
    }
    for (const m of ms) {
      // Chanting the blessing: heads bowed; the elder's hand raised at its end.
      const bless = h.step === 'bless';
      m.a.tilt(bless ? CHANT_TILT : 0.12);
      if (!m.r.busy) m.a.pose(bless && m === ms[0] && h.t > HALT - 1.8 ? POSE.nod : POSE.stand, now);
    }
  }

  /** The chant of a blessing, heard from where it is (only near enough). */
  private chant(f: MapFrame, at: Point, now: number): void {
    if (this.env.shot || now - this.chantAt < 3) return;
    this.chantAt = now;
    const d = Math.hypot(at.x - f.listener.x, at.y - f.listener.y, at.z - f.listener.z);
    const gain = Math.min(1, Math.max(0, 1 - (d - 8) / 40));
    if (gain > 0.04) SFX.play('dakChant', gain * 0.7);
  }

  // ── The explorer's offering (DAK.ask) ────────────────────────────────────────

  /** His ask: the first monk not past him yet goes to him; the others wait. None (all past): refused. */
  private take(): void {
    const ask = DAK.ask;
    this.taken = ask.n;
    let pick = -1;
    for (let k = 0; k < MONKS; k++) {
      const sk = this.s - k * GAP;
      if (sk > this.route.len - END_EARLY - 1) continue;
      const p = this.route.at(Math.max(0, sk), 0, P);
      const along = (ask.x - p.x) * Math.sin(p.yaw!) + (ask.z - p.z) * Math.cos(p.yaw!);
      if (along > 0.4) {
        pick = k;
        break;
      }
    }
    if (pick < 0) {
      ask.state = 'none';
      return;
    }
    ask.k = pick;
    ask.state = 'coming';
    this.phase = 'claim';
    // (the line walks on until he is near: then he steps over to stand before him, the others halt)
    this.claim = { k: pick, t: 0, step: 'go', n: ask.n, fill0: this.monks[pick].b.fill, sSpot: this.route.nearest(ask.mx, ask.mz) };
  }

  /** A check (`dakbat=give|bless`): the monk stands before him at once, the lid as it would be then. */
  private serveSnap(now: number): void {
    const ask = DAK.ask;
    if (!ask.snap || ask.line !== '' || ask.state === 'none' || !nearWay(ALMS_WAY, ask.x, ask.z, 12)) return;
    ask.snap = false;
    ask.line = ALMS_LINE;
    // (the line halted round him: the leader goes to him, the others wait behind on the way)
    this.s = Math.max(0.5, this.route.nearest(ask.x, ask.z) + 0.6);
    this.phase = 'walk';
    this.halt = null;
    this.taken = ask.n;
    const k = 0;
    ask.k = k;
    this.phase = 'claim';
    const bless = ask.state === 'bless';
    this.claim = { k, t: 0, step: bless ? 'bless' : 'there', n: ask.n, fill0: 0.35, sSpot: this.s };
    for (let j = 0; j < MONKS; j++) {
      const m = this.monks[j];
      const sk = this.s - j * GAP;
      this.place(m, sk);
      m.aside = j === k;
      if (m.aside) {
        m.gx = ask.mx;
        m.gz = ask.mz;
        m.face = ask.myaw;
      }
      m.a.warp(m.gx, this.env.ground.field.heightAt(m.gx, m.gz), m.gz, m.face ?? this.route.yawAt(Math.max(0, sk)));
      m.a.show();
      m.a.pose(POSE.stand, now);
      m.a.carry(1, now);
      m.b.fill = 0.35;
    }
    const m = this.monks[k];
    if (!bless) m.r.open(m.a, now, true);
    AlmsBowl.mouth(m.a, 1, Q);
    ask.bx = Q.x;
    ask.by = Q.y;
    ask.bz = Q.z;
  }

  /** No line out: an ask to it is refused at once. */
  private answerOff(): void {
    const ask = DAK.ask;
    if (ask.line === ALMS_LINE && ask.state === 'ask' && ask.n !== this.taken) {
      this.taken = ask.n;
      ask.state = 'none';
    }
  }

  private stepClaim(dt: number, now: number): void {
    const c = this.claim!;
    const ask = DAK.ask;
    const m = this.monks[c.k];
    c.t += dt;
    // (let go: he got up, or it is over)
    const gone = ask.n !== c.n || ask.state === 'none' || ask.state === 'done';
    if (gone && c.step !== 'back') {
      c.step = 'back';
      c.t = 0;
      m.r.close();
      // (back into the line where he stood out of it: the ones behind walk up)
      if (m.aside) this.s = Math.max(this.s, c.sSpot + c.k * GAP);
      const sk = this.s - c.k * GAP;
      this.place(m, sk);
      m.aside = true;
      m.face = null;
    }
    switch (c.step) {
      case 'go': {
        // On along the way with the others until he is near; then over to stand before him, facing him.
        const sk = this.s - c.k * GAP;
        const p = this.route.at(Math.max(0, sk), 0, P);
        const dx = p.x - ask.mx;
        const dz = p.z - ask.mz;
        const near = dx * dx + dz * dz < 2.6 * 2.6 || sk >= c.sSpot - 0.3;
        if (!near && !m.aside) {
          let lag = false;
          for (const mm of this.monks) if (mm.a.shown && !mm.aside && mm.a.behind > 1.5) lag = true;
          if (!lag) this.s += SPEED * dt;
        } else if (!m.aside) {
          m.aside = true;
          m.gx = ask.mx;
          m.gz = ask.mz;
          m.face = ask.myaw;
        }
        if ((m.aside && m.a.dist(m.gx, m.gz) < 0.12 && Math.abs(wrap(ask.myaw - m.a.yaw)) < 0.08 && m.a.speed < 0.02) || c.t > 20) {
          c.step = 'settle';
          c.t = 0;
        }
        break;
      }
      case 'settle':
        if (c.t > 0.35) {
          c.step = 'open';
          c.t = 0;
          m.r.open(m.a, now);
        }
        break;
      case 'open':
        if (m.r.phase === 'open') {
          c.step = 'there';
          AlmsBowl.mouth(m.a, 1, Q);
          ask.bx = Q.x;
          ask.by = Q.y;
          ask.bz = Q.z;
          ask.state = 'there';
        }
        break;
      case 'there':
        m.b.fill = Math.min(1, c.fill0 + 0.4 * ask.rice);
        if (ask.state === 'given' || ask.state === 'bless') {
          c.step = 'close';
          m.r.close();
        }
        break;
      case 'close':
        if (!m.r.busy) c.step = 'bless';
        break;
      case 'bless':
        break;
      case 'back':
        // (the bowl back first, then into his place in the line)
        if (m.r.busy) m.a.stop();
        if (!m.r.busy && (m.a.dist(m.gx, m.gz) < 0.25 || c.t > 8)) {
          m.aside = false;
          this.claim = null;
          this.phase = 'walk';
        }
        break;
    }
    // Everyone holds where they are; chanting for him, heads bowed.
    const bless = ask.state === 'bless' && (c.step === 'bless' || c.step === 'close');
    for (const mm of this.monks) {
      mm.a.tilt(bless ? CHANT_TILT : mm === m && c.step !== 'go' && c.step !== 'back' ? 0.3 : 0.12);
      if (!mm.r.busy) mm.a.pose(POSE.stand, now);
    }
  }

  // ── The families ───────────────────────────────────────────────────────────

  private givers(dt: number, now: number, ex: Obstacle | null): void {
    for (const st of this.stops) {
      const h = this.halt?.stop === st ? this.halt : null;
      for (const g of st.givers) {
        const a = g.a;
        switch (g.phase) {
          case 'home':
            if (!st.done && this.s > st.s - COME_OUT) {
              g.phase = 'out';
              g.leg = 1;
              const w = g.way[0];
              a.warp(w.x, w.y, w.z, st.home.facing);
              a.show();
              a.pose(POSE.stand, now);
              a.carry(1, now);
              st.mat.write();
            }
            continue;
          case 'out': {
            const w = g.way[g.leg];
            a.goTo(w.x, w.z, GIVER_WALK);
            a.face(null);
            if (a.dist(w.x, w.z) < 0.15) {
              if (g.leg < g.way.length - 1) g.leg++;
              else g.phase = 'wait';
            }
            break;
          }
          case 'wait':
            a.goTo(g.spot.x, g.spot.z, 0.4);
            a.face(g.spot.yaw);
            if (h && (h.step === 'give' || h.step === 'close')) {
              g.phase = 'give';
              a.pose(POSE.give, now);
            } else if (h && h.step === 'bless') {
              // (a stop found mid-blessing: kneeling already)
              g.phase = 'kneel';
              a.pose(POSE.kneel, now);
            } else a.pose(POSE.stand, now);
            break;
          case 'give':
            a.goTo(g.spot.x, g.spot.z, 0.4);
            a.face(g.spot.yaw);
            // (the rice given, palms together for the blessing, kneeling)
            if (!h || h.step === 'bless' || (h.step === 'close' && h.t > AT.close + LID_DOWN)) {
              g.phase = 'kneel';
              a.pose(POSE.kneel, now);
            }
            break;
          case 'kneel':
            a.goTo(g.spot.x, g.spot.z, 0.4);
            a.face(g.spot.yaw);
            a.pose(POSE.kneel, now);
            // (the monks gone on along the way: up, and home)
            if (st.done && this.s > st.s + GO_IN + MONKS * GAP) {
              g.phase = 'in';
              g.leg = g.way.length - 2;
              a.pose(POSE.stand, now);
            }
            break;
          case 'in': {
            const w = g.way[g.leg];
            a.goTo(w.x, w.z, GIVER_WALK);
            a.face(null);
            if (a.dist(w.x, w.z) < 0.15) {
              if (g.leg > 0) g.leg--;
              else {
                g.phase = 'home';
                a.hide();
                let all = true;
                for (const o of st.givers) if (o.phase !== 'home') all = false;
                if (all) st.mat.hide();
                continue;
              }
            }
            break;
          }
        }
        // (the explorer close by: they look at him a moment, else at the monks coming)
        if (ex && a.dist(ex.x, ex.z) < 4 && g.phase === 'wait') {
          EYE.x = ex.x;
          EYE.y = ex.y + 2;
          EYE.z = ex.z;
          a.lookAt(EYE, now + 1);
        } else a.lookAt(null);
        a.step(dt, now);
      }
    }
  }

  private hideAll(): void {
    this.shown = false;
    this.stale = true;
    for (const m of this.monks) {
      m.r.stop(m.a);
      if (m.a.shown) m.a.hide();
      m.slot.on = false;
      m.aside = false;
    }
    for (const st of this.stops) {
      for (const g of st.givers) if (g.a.shown) g.a.hide();
      st.mat.hide();
    }
    // (an offering under way is let go: he is far off anyway)
    if (DAK.ask.line === ALMS_LINE && DAK.ask.state !== 'none') DAK.ask.state = 'none';
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

/** A giver's look: as their kind dresses them, with a woven tray of rice and lotus held at the belly (`give` offers it). */
function giverLook(kind: 'villager' | 'kid', seed: number, opts: Parameters<typeof dress>[2]): Look {
  const look = dress(kind, seed, { ...opts, carry: CARRY.tray, props: [FEAT.tray] });
  look.colors[SLOT.prop] = 0xf3efe4;
  look.colors[SLOT.prop2] = 0xe58aa6;
  look.colors[SLOT.wood] = 0xc49a5c;
  return look;
}

const smooth = (k: number): number => k * k * (3 - 2 * k);
