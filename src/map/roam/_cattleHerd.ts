import type { Camera, Object3D } from 'three';
import { BUILT, PIECES, pieceToWorld, type Built } from '../build/pieces';
import { addRideCow, COW_RIDE, removeRideCow, rideCow, type RideCow } from '../cattle/ride';
import { CATTLE_OBSTACLES, inHours, LIE_HOURS, OX_NOSE, PEN_HOURS, postAnimal, ROPE, STAKES, TRADER_POSTS, traderToWorld, traderYaw } from '../cattle/plan';
import { ageOf, coatTint, coatVariant, condOf, hungry, sizeOf, THIN, type Cow } from '../cattle/state';
import { CH, Flock } from '../fauna/_kit';
import { GARDEN } from '../garden/state';
import { isTree, KINDS, stageOf, trunkAt } from '../garden/kinds';
import { OX } from '../people/_ox';
import type { AnimalCall } from '../types';
import { hash3 } from '../../voxel/random';
import { drawRideCow } from '../people/_oxRide';
import { BIKE_OWN } from './_bikeOwn';
import { lineWalk, PathSearch } from './_dogPath';
import { CattleBlocks } from './_cattleBlocks';
import type { RoamWorld } from './types';

/**
 * His cows and the trader's (add-on `cattle`: roam/_cattle.ts), on the map:
 * where each one is and what it does, drawn with the white ox of the villages
 * (people/_ox.ts `OX`) through the fauna kit's `Flock` (one instanced mesh, its
 * shadow), their ropes, his stakes and their food (`CattleBlocks`: one more).
 *
 * - **His cows** (cattle/state.ts `CATTLE.herd`), each at its stake on the
 *   meadow north of his house (cattle/plan.ts `STAKES`) by day: grazing round it
 *   as far as the rope lets them (`ROPE`), heads down, ambling to a fresh patch
 *   now and then, never onto his garden's plants; looking up, lowing (a hungry
 *   one more often), the bell on the collar clonking, the tail swishing (the
 *   shader). Before dusk (`PEN_HOURS`) they walk into his pen if he has built
 *   one (build/pieces.ts `BUILT`: id `pen`, standing), each to its place in the
 *   room facing the trough, and lie down; after dawn they walk out to their
 *   stakes again. With no pen they lie down by their stakes through the night
 *   (`LIE_HOURS`). Calves are small, and grow with the fed days (`sizeOf`); a
 *   thin one hangs its head and its coat is duller.
 * - **Ways**: a cow walks a way (to its stake, to the pen, home after a ride,
 *   off to the trader once sold) on the walk map as the dog finds its own
 *   (roam/_dogPath.ts: a straight line if it can, else the search), a cow's
 *   size: room over it, its width, never through his garden's plants or what
 *   he has built. Out of everyone's sight (far from him and the camera) it is
 *   simply there. It stops for him standing in its way.
 * - **The ride** (cattle/ride.ts `COW_RIDE`): each of his cows is a `RideCow`
 *   (`own-<id>`), its fields written every step; `canRide` when grown and
 *   standing, grazing, eating or lying. While `ridden` it is drawn from the
 *   ride's fields only (its place, tilt, step, head); let go, it walks back.
 * - **The trader's** three (the grown plough ox, the calf and the young cow for
 *   sale: `TRADER_POSTS`), tied to his posts: grazing, looking up at him,
 *   lying down at night. One he sells is untied and walks to his meadow as his
 *   new cow; another takes its place a while later, out of his sight.
 *
 * Steps (`tick`) run on roaming's steps (the shots' `sim=` too) and on the
 * map's frames in the overview; drawing (`draw`) every frame. Seeded (no
 * Math.random): a shot draws the same herd every time.
 */

/** Animals drawn at most: his four, the trader's three, two being led off (sold). */
const SLOTS = 9;
/** Pace (m/s): ambling to a fresh patch, walking a way (× its size over a grown one's, a calf trots after). */
const AMBLE = 0.32;
/** Turning to amble (rad/s, stepping round). */
const AMBLE_TURN = 1.1;
const WALK = 0.75;
/** Steps a second for a pace (the village herd's: people/_sceneEastVillage.ts `show`). */
const hzOf = (speed: number, size: number): number => speed / (0.775 * size);
/** A cow's room over the ground (m: its hump at 1.4 × the model), and half its width for the walk map's probes. */
const COW_ROOM = 1.7;
const COW_HALF = 0.42;
/** Within this far of him or the camera (m) a cow walks its way; farther it is simply where it goes. */
const SEEN = 75;
/** Hidden past this far from the camera (m): a speck. */
const FAR = 420;
/** Its head right down to the grass or the heap (the ox's head channel past 1 lowers it further: people/_ox.ts). */
const GRAZE = 2.4;
/** Eating a bundle takes this long (s). */
export const EAT_S = 22;
/** A rope's look: hemp, its thickness (m). */
const ROPE_COL = 0x9a8058;
const ROPE_W = 0.035;
const STAKE_COL = 0x6a4c30;
const STRAW_COL = [0xd6b866, 0xc9a854, 0xe2c878, 0xbf9d4a];
const GRASS_COL = [0x5e9a36, 0x4c8a2c, 0x6eaa40, 0x58923a];

/** A pen's place (a standing piece, or where one stood). */
type PenAt = { uid: string; x: number; z: number; yaw: number };

export type Doing = 'graze' | 'amble' | 'stand' | 'low' | 'eat' | 'lie' | 'way' | 'wait' | 'gate';
type Goal = 'stake' | 'pen' | 'trader' | 'post';

export interface Beast {
  /** Its flock slot. */
  readonly i: number;
  /** His cow (null: the trader's). */
  cow: Cow | null;
  /** The trader's post it is tied to (0‥2), or −1. */
  post: number;
  ride: RideCow | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  size: number;
  doing: Doing;
  /** When what it does ends (s, the herd's time). */
  until: number;
  /** Ambling to (m). */
  tx: number;
  tz: number;
  /** Its head (0 level, 1 down grazing, −1 up lowing) and its turn (−1‥1), lying (0, 1). */
  head: number;
  turn: number;
  rest: number;
  speed: number;
  /** Where it means to be, and whether it is there. */
  goal: Goal;
  at: boolean;
  /** Its way (m), the point it walks to next, and whether it waits for the search. */
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  readonly wz: Float32Array;
  /** The way it faces along each leg (NaN: the way it walks; the pen's lane holds it: in, sideways to its place, backing out). */
  readonly wf: Float32Array;
  wn: number;
  wi: number;
  searching: boolean;
  /** Sold: walks off to the trader, then gone; its place there (`LEAVE_SPOTS`). */
  leaving: boolean;
  leaveAt: number;
  /** Eating: straw or grass, how much is left of the heap (0‥1). */
  food: 'straw' | 'grass' | null;
  left: number;
  /**
   * Its pen (the piece's uid, '' none), its place there (−1: none: it has one from the lane in to the lane out), the
   * lane it walks now (0 none, 1 in, 2 out).
   */
  penUid: string;
  penSlot: number;
  lane: number;
  /** Where its pen stood when it took its place there: taken down meanwhile, it still leaves by the lane (none through the others). */
  readonly penAt: PenAt;
  /** How long another animal has stood in its way (s; below 0: it has just gone round one), and whether that one waits its turn at a gate (or behind one that does): a queue, not gone round. */
  waitCow: number;
  queued: boolean;
  /** No way to its pen found (built where a cow cannot walk to): till then (s) it spends the night at its stake. */
  noPenUntil: number;
  /** When it looks next whether a plant or something he built is under it now (s). */
  checkAt: number;
  /** Where it is put down when it is simply there (`patch` with `placing`): its heading. */
  tyaw: number;
  /** Next bell, next low, next mouthful (s). */
  bellAt: number;
  lowAt: number;
  munchAt: number;
  /** It was ridden last step (the ride let go: it walks back). */
  wasRidden: boolean;
  /** How long he has stood in its way (s). */
  blocked: number;
  /** Its lying (`rest`) as it was, and when it last changed (s): the shader eases it over a second. */
  restWas: number;
  restAt: number;
  /** Its coat as set on the flock (look, thin), so it is set again only when it changes. */
  coat: number;
  /** The trader's animal's look (cattle/state.ts `look`: the coat and its brightness): the cow he buys keeps it. */
  look: number;
}

const _pa = { x: 0, z: 0, face: 0 };
const _pw: [number, number] = [0, 0];

/**
 * The pen's four places (piece frame: x, a nudge to its depth, the way it faces: the trough at the back, −z), filled
 * in this order: the far sides first, then the two by the lane. A grown cow (≈ 3.6 m) has no room to turn in the room
 * (6.4 × 4.6 m) once another stands there, nor at a far side's place (1.1 m from the rail), so each walks in through
 * the gate facing the trough, steps sideways to its place, and in the morning steps back to the lane and backs out
 * (`lane`): one at a time, the two by the lane out first.
 */
const PEN_SLOTS: readonly (readonly [number, number, number])[] = [
  [-2.5, 0.06, Math.PI - 0.05],
  [2.5, -0.04, Math.PI + 0.06],
  [-0.85, -0.06, Math.PI + 0.04],
  [0.85, 0.05, Math.PI - 0.04],
];
/** The place by the lane on the same side as a far one (−1: none): it must be empty before the far one steps out. */
const PEN_INNER = [2, 3, -1, -1];
/** Its depth in the room by its size: the nose ≈ 0.9 m short of the back rail, the rump clear of the front one. */
const slotDepth = (size: number): number => Math.min(2.55 - 0.9 * size, -1.75 + 1.62 * size);
/** Walking the lane in, stepping sideways, backing out (m/s); turning on the spot before the gate (rad/s). */
const LANE_PACE = 0.6;
const SHUFFLE = 0.36;
const BACK = 0.5;
const GATE_TURN = 1.6;
/** No way to its pen: it tries again this long after (s: most of a game day). */
const NO_PEN_RETRY = 300;
/** The ox's body along its middle (model units: the rump to the muzzle), its half width; the points before it as it walks. */
const BODY_BACK = 0.88;
const BODY_FRONT = 1.67;
const BODY_HALF = 0.31;
const BODY_U = [-0.82, -0.3, 0.25, 0.8, 1.35, 1.62];
const AHEAD_U = [0.95, 1.45, 1.95];
/** Whether (px, pz) is in the body of an ox at (x, z) facing `yaw`, `size`, grown by `pad` (m). */
function inBody(x: number, z: number, yaw: number, size: number, px: number, pz: number, pad: number): boolean {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const dx = px - x;
  const dz = pz - z;
  const along = dx * fx + dz * fz;
  if (along < -BODY_BACK * size - pad || along > BODY_FRONT * size + pad) return false;
  return Math.abs(dx * fz - dz * fx) < BODY_HALF * size + pad;
}
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** In his bicycle where he left it (roam/_bikeOwn.ts `BIKE_OWN`: from its back tyre to its front one, its bars), grown by `pad` (m). */
function bikeAt(x: number, z: number, pad: number): boolean {
  if (!BIKE_OWN.kind || BIKE_OWN.riding) return false;
  const dx = x - BIKE_OWN.x;
  const dz = z - BIKE_OWN.z;
  if (dx * dx + dz * dz > 9) return false;
  const fx = Math.sin(BIKE_OWN.yaw);
  const fz = Math.cos(BIKE_OWN.yaw);
  const along = dx * fx + dz * fz;
  return along > -0.75 - pad && along < 1.1 + pad && Math.abs(dx * fz - dz * fx) < 0.32 + pad;
}
/** Where his cows sold wait by the trader's trough (his place's frame), side by side, until nobody sees them. */
const LEAVE_SPOTS: readonly (readonly [number, number])[] = [
  [-6.5, -1.5],
  [-7.1, -4.3],
  [-9.3, -0.6],
  [-9.8, -3.6],
];
/** Its gate's outside on the lane's line (m past the front rail): a grown cow turns there clear of the rails. */
const GATE_OUT = 2.7;

export class CattleHerd {
  readonly flock = new Flock(OX, SLOTS);
  readonly blocks = new CattleBlocks();
  readonly beasts: Beast[] = [];
  /** The herd's own time (s): the shader's clock, what each animal does next. */
  time = 0;
  private readonly free: number[] = [];
  private readonly search = new PathSearch();
  /** The beast the search is for (one at a time), and those waiting for it. */
  private searchFor: Beast | null = null;
  private readonly queue: Beast[] = [];
  /** The walk map a cow's size: room over it, its width, his garden's plants and what he built kept out (`cowStand`). */
  private readonly cowWorld: RoamWorld;
  /** The trader's post emptied by a sale, and when another animal comes (s); how many he has sold from each. */
  private readonly restockAt = [-1, -1, -1];
  private readonly sales = [0, 0, 0];
  /** Where the explorer is (m) and whether he roams; the camera's place. */
  private ex = 0;
  private ez = 0;
  private ey = 0;
  private roaming = false;
  private camX = 0;
  private camZ = 0;
  /** Sounds and calls to make this frame (the add-on plays them): lowing (calves higher), the bells (the people's call). */
  readonly sounds: { moo: number; calf: number; munch: number } = { moo: 0, calf: 0, munch: 0 };
  /** Set the shots' stills: everything settled where the clock has it (no walking). */
  still = false;
  /**
   * The grass he cuts (roam/_cattleWork.ts): a clump of tall blades before him, `cut` of its four fistfuls cut down to
   * stubble; it stays a while after (`since`: when it was last cut, the herd's time).
   */
  readonly clump = { on: false, x: 0, y: 0, z: 0, yaw: 0, cut: 0, since: 0 };
  /** Checks (`__cattle`): the last way found for each slot (points), and what the searches did. */
  readonly stats = { searches: 0, straight: 0, failed: 0, snapped: 0 };

  constructor(
    private readonly world: RoamWorld,
    scene: Object3D,
  ) {
    for (let i = SLOTS - 1; i >= 0; i--) this.free.push(i);
    this.flock.mesh.name = 'cattle:ox';
    scene.add(this.flock.mesh, this.blocks.mesh);
    const w = world;
    const stand = (x: number, z: number, y: number, up: number, h: number): number => this.cowStand(x, z, y, up, h);
    this.cowWorld = {
      get field() {
        return w.field;
      },
      groundAt: (x, z) => w.groundAt(x, z),
      waterAt: (x, z) => w.waterAt(x, z),
      flowAt: (x, z, o) => w.flowAt(x, z, o),
      inBounds: (x, z) => w.inBounds(x, z),
      placeNear: (x, z, y) => w.placeNear(x, z, y),
      standAt: stand,
    };
    // The trader's three, at their posts.
    for (let k = 0; k < TRADER_POSTS.length; k++) this.addTraders(k);
  }

  // ── Who is here ────────────────────────────────────────────────────────────

  private take(): number {
    return this.free.length ? this.free.pop()! : -1;
  }

  private newBeast(i: number): Beast {
    return {
      i, cow: null, post: -1, ride: null, x: 0, y: 0, z: 0, yaw: 0, size: 1.4, doing: 'graze', until: 0, tx: 0, tz: 0, head: 1, turn: 0, rest: 0, speed: 0,
      goal: 'stake', at: false, wx: new Float32Array(1024), wy: new Float32Array(1024), wz: new Float32Array(1024), wf: new Float32Array(1024), wn: 0, wi: 0, searching: false, leaving: false, leaveAt: 0,
      food: null, left: 0, penUid: '', penSlot: -1, lane: 0, penAt: { uid: '', x: 0, z: 0, yaw: 0 }, waitCow: 0, queued: false, noPenUntil: -1, checkAt: 0, tyaw: 0, bellAt: 0, lowAt: 0, munchAt: 0, wasRidden: false, blocked: 0, restWas: 0, restAt: -10, coat: -1, look: 0,
    };
  }

  /** The trader's animal at post `k`. */
  private addTraders(k: number): void {
    const i = this.take();
    if (i < 0) return;
    const b = this.newBeast(i);
    const p = TRADER_POSTS[k];
    b.post = k;
    b.size = p.size;
    b.goal = 'post';
    // (the plough ox grey-cream; the calf and the young cow for sale each a new one after a sale: white or grey-cream by turns)
    b.look = k === 0 ? 3 : (TRADER_LOOKS[k] + 3 * this.sales[k]) % 8;
    this.home(b, true);
    this.flock.setup(i, coatVariant(b.look), 0.13 + k * 0.31 + this.sales[k] * 0.17, coatTint(b.look));
    b.lowAt = 30 + 40 * hash3(k, 3, 1, 7101);
    b.bellAt = 4 + 6 * hash3(k, 5, 1, 7102);
    this.beasts.push(b);
  }

  /** The herd changed (bought, sold, a check's): a beast for every cow of his, none for a cow he no longer has. */
  sync(cows: readonly Cow[], snap: boolean): void {
    for (const c of cows) this.addOwn(c, snap);
    // (a cow sold walks off; one gone from the list another way — a check's — goes at once)
    for (let k = this.beasts.length - 1; k >= 0; k--) {
      const b = this.beasts[k];
      if (!b.cow || cows.includes(b.cow) || b.leaving) continue;
      this.drop(b);
    }
  }

  /** A beast for his cow `c` (none yet): where it belongs at once (`snap`), else where it is put next. */
  private addOwn(c: Cow, snap: boolean): Beast | null {
    if (this.beasts.some((b) => b.cow === c)) return null;
    const i = this.take();
    if (i < 0) return null;
    const b = this.newBeast(i);
    b.cow = c;
    b.size = sizeOf(c);
    b.ride = rideCow(`own-${c.id}`, 'his');
    addRideCow(b.ride);
    b.lowAt = this.time + 20 + 50 * hash3(c.id, 9, 2, 7103);
    b.bellAt = this.time + 3 + 8 * hash3(c.id, 7, 2, 7104);
    this.beasts.push(b);
    if (snap) this.home(b, true);
    return b;
  }

  /** A beast off the map: its slot free, its ride gone. */
  private drop(b: Beast): void {
    const k = this.beasts.indexOf(b);
    if (k >= 0) this.beasts.splice(k, 1);
    this.flock.hide(b.i);
    this.free.push(b.i);
    if (b.ride) removeRideCow(b.ride.id);
    if (this.searchFor === b) {
      this.search.cancel();
      this.searchFor = null;
    }
    const q = this.queue.indexOf(b);
    if (q >= 0) this.queue.splice(q, 1);
  }

  /**
   * He bought the trader's calf or young cow: the animal at that post is untied and is his new cow (`c`), walking to
   * its stake; the post stays empty until another comes (out of his sight).
   */
  handOver(c: Cow, kind: 'calf' | 'young'): void {
    const k = TRADER_POSTS.findIndex((p) => p.kind === kind);
    const old = this.beasts.find((b) => b.post === k);
    if (old) {
      old.cow = c;
      old.post = -1;
      old.ride = rideCow(`own-${c.id}`, 'his');
      addRideCow(old.ride);
      old.goal = 'stake';
      old.at = false;
      old.doing = 'stand';
      old.until = this.time + 1.2;
      old.size = sizeOf(c);
      old.lowAt = this.time + 30;
      this.restockAt[k] = this.time + 120;
      this.sales[k]++;
      this.setCoat(old);
      return;
    }
    // (none at that post now — he sold it a moment ago and the next is not tied there yet —: the new one is simply at
    // its stake, on the meadow behind the camera at the stool; the other cows of his stay as they are)
    this.addOwn(c, true);
  }

  /** The look of the trader's calf or young cow for sale now (the cow he buys is that one). */
  lookFor(kind: 'calf' | 'young'): number {
    const k = TRADER_POSTS.findIndex((p) => p.kind === kind);
    const b = this.beasts.find((q) => q.post === k);
    return b ? b.look : (TRADER_LOOKS[k] + 3 * this.sales[k]) % 8;
  }

  /** He sold his cow `c`: it walks off to the trader's place (then it is gone). */
  sold(c: Cow): void {
    const b = this.beasts.find((q) => q.cow === c);
    if (!b) return;
    if (b.ride) removeRideCow(b.ride.id);
    b.ride = null;
    // (side by side with any sold before it that still wait there)
    let j = 0;
    for (const q of this.beasts) if (q.leaving && q !== b) j++;
    b.leaveAt = j % LEAVE_SPOTS.length;
    b.leaving = true;
    b.food = null;
    b.goal = 'trader';
    b.at = false;
    // (in the pen — sold at dawn —: out through its gate first)
    this.plan(b);
  }

  // ── Where it belongs ───────────────────────────────────────────────────────

  /** The standing pens he has built (build/pieces.ts `BUILT`). */
  private pens(): number {
    let n = 0;
    for (const p of BUILT.list) if (p.id === 'pen' && p.done >= 1) n++;
    return n;
  }
  private penAt(n: number): Built | null {
    let k = 0;
    for (const p of BUILT.list)
      if (p.id === 'pen' && p.done >= 1) {
        if (k === n) return p;
        k++;
      }
    return null;
  }

  /** Where it should be now (its goal), by the clock and the pens. */
  private goalNow(b: Beast, clock: number): Goal {
    if (b.post >= 0) return 'post';
    if (b.leaving) return 'trader';
    if (inHours(clock, PEN_HOURS) && this.pens() > 0 && this.time >= b.noPenUntil) return 'pen';
    return 'stake';
  }

  /** The standing pen with this uid, or null (none, taken down). */
  private penOf(uid: string): Built | null {
    if (!uid) return null;
    for (const p of BUILT.list) if (p.uid === uid && p.id === 'pen' && p.done >= 1) return p;
    return null;
  }

  /** Its pen: the cows of his in the herd's order, one to each pen in turn (two pens: two cows each). */
  private penFor(b: Beast): Built | null {
    const n = this.pens();
    if (!n) return null;
    let k = 0;
    for (const q of this.beasts) {
      if (!q.cow || q.leaving) continue;
      if (q === b) break;
      k++;
    }
    return this.penAt(k % n);
  }

  /** Its place in pen `p`: the one it has, else the first free (`PEN_SLOTS`' order). */
  private claimSlot(b: Beast, p: PenAt): void {
    if (b.penUid === p.uid && b.penSlot >= 0) return;
    b.penUid = p.uid;
    b.penAt.uid = p.uid;
    b.penAt.x = p.x;
    b.penAt.z = p.z;
    b.penAt.yaw = p.yaw;
    for (let k = 0; k < PEN_SLOTS.length; k++) {
      let taken = false;
      for (const q of this.beasts) if (q !== b && q.penUid === p.uid && q.penSlot === k) taken = true;
      if (taken) continue;
      b.penSlot = k;
      return;
    }
    b.penSlot = 0;
  }

  /** Its place in its pen's frame (x, z) and the way it faces there (local), by its size, into `out`. */
  private slotLocal(b: Beast, out: { x: number; z: number; face: number }): void {
    const s = PEN_SLOTS[b.penSlot] ?? PEN_SLOTS[0];
    out.x = s[0];
    out.z = slotDepth(b.size) + s[1];
    out.face = s[2];
  }

  /** The pen it is in now (its place there or the lane to it), or null. */
  private penIn(b: Beast): PenAt | null {
    if (b.penSlot < 0) return null;
    // (taken down while it was in: where it stood, so it leaves by the lane all the same)
    return this.penOf(b.penUid) ?? (b.penAt.uid === b.penUid ? b.penAt : null);
  }

  /** Not in a pen (a pen taken down, a ride, back to the map): its pen fields cleared. */
  private unpen(b: Beast): void {
    b.penUid = '';
    b.penSlot = -1;
    b.lane = 0;
  }

  /** The point of its goal (m) and the way it faces there, into `out`. */
  private goalPoint(b: Beast, out: { x: number; z: number; face: number }): boolean {
    if (b.goal === 'post') {
      postAnimal(b.post, out);
      const [x, z] = traderToWorld(out.x, out.z);
      out.x = x;
      out.z = z;
      out.face = traderYaw(out.face);
      return true;
    }
    if (b.goal === 'trader') {
      // (off to the trader: to the far side of his place, by the trough, where it is untied and led away)
      const sp = LEAVE_SPOTS[b.leaveAt] ?? LEAVE_SPOTS[0];
      const [x, z] = traderToWorld(sp[0], sp[1]);
      out.x = x;
      out.z = z;
      out.face = traderYaw(Math.PI);
      return true;
    }
    if (!b.cow) return false;
    const st = STAKES[b.cow.stake] ?? STAKES[0];
    out.x = st[0];
    out.z = st[1];
    out.face = b.yaw;
    return true;
  }

  /** Put it where it belongs now at once (first seen, a check's still, or out of sight), doing what fits there. */
  private home(b: Beast, first: boolean): void {
    const g = _pa;
    b.lane = 0;
    b.waitCow = 0;
    b.queued = false;
    const pen = b.goal === 'pen' && b.cow ? this.penFor(b) : null;
    if (pen) {
      // (at its place in its pen, facing the trough)
      this.claimSlot(b, pen);
      this.slotLocal(b, g);
      pieceToWorld(pen, g.x, g.z, _pw);
      b.x = _pw[0];
      b.z = _pw[1];
      b.yaw = pen.yaw + g.face;
    } else if (b.goal === 'stake' && b.cow) {
      // (somewhere round its stake, a seeded spot: clear of his plants, what he built and the others)
      this.unpen(b);
      this.patch(b, first ? 0 : 1, true);
      b.x = b.tx;
      b.z = b.tz;
      b.yaw = b.tyaw;
    } else {
      this.unpen(b);
      this.goalPoint(b, g);
      b.x = g.x;
      b.z = g.z;
      b.yaw = g.face;
    }
    b.y = this.groundY(b.x, b.z, b.y);
    b.at = true;
    b.wn = b.wi = 0;
    b.searching = false;
    b.doing = 'graze';
    b.until = this.time + 4 + 10 * hash3(b.i, 3, Math.floor(this.time), 7106);
    if (b.leaving) this.drop(b);
    this.stats.snapped++;
  }

  /**
   * A fresh patch round its stake (as far as the rope lets its middle go) where its body stands clear of his plants,
   * what he has built and the other cows: into `tx, tz`. Ambling there (not `placing`) it faces the way it walks and
   * nothing he built or planted is between; `placing` (it is simply there) it gets a heading that is clear (`tyaw`).
   */
  private patch(b: Beast, salt: number, placing = false): void {
    const st = b.cow ? (STAKES[b.cow.stake] ?? STAKES[0]) : STAKES[0];
    const seed = (b.cow?.id ?? b.i) * 13 + salt;
    // (where it stands now is not clear — a plant or a fence put there —: it may walk off it)
    const stuck = !placing && !this.bodyFree(b, b.x, b.z, b.yaw, false);
    for (let k = 0; k < 10; k++) {
      const a = hash3(seed, k, Math.floor(this.time / 7), 7107) * Math.PI * 2;
      const r = ROPE * (0.45 + 0.55 * Math.sqrt(hash3(seed, k, Math.floor(this.time / 7), 7108)));
      const x = st[0] + Math.sin(a) * r;
      const z = st[1] + Math.cos(a) * r;
      if (this.plantNear(x, z, b.size * 0.9) || this.otherNear(b, x, z)) continue;
      if (placing) {
        const yaw = this.freeYaw(b, x, z, (hash3(seed, k, Math.floor(this.time / 30), 7105) - 0.5) * 6.2);
        if (Number.isNaN(yaw)) continue;
        b.tyaw = yaw;
      } else {
        if (Math.hypot(x - b.x, z - b.z) < 0.3) continue;
        const head = Math.atan2(x - b.x, z - b.z);
        if (!this.bodyFree(b, x, z, head, true)) continue;
        // (it turns there on the spot first: its long body swings clear; one stuck on something just goes)
        if (!stuck && !this.sweepFree(b, b.x, b.z, b.yaw, head)) continue;
        if (!stuck && Number.isNaN(lineWalk(this.cowWorld, b.x, b.y, b.z, x, z, true))) continue;
      }
      b.tx = x;
      b.tz = z;
      return;
    }
    if (placing) {
      b.tx = st[0] + 0.6;
      b.tz = st[1] + 0.6;
      b.tyaw = (hash3(seed, 11, 3, 7105) - 0.5) * 6.2;
    } else {
      // (nowhere clear just now: it stays)
      b.tx = b.x;
      b.tz = b.z;
    }
  }

  /**
   * Its body standing at (x, z) facing `yaw` clear of what he built, his plants and (`cows`) the other animals where
   * they stand and where those ambling go.
   */
  private bodyFree(b: Beast, x: number, z: number, yaw: number, cows: boolean): boolean {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const s = b.size;
    const y = this.groundY(x, z, b.y);
    const pad = 0.15 + BODY_HALF * s;
    for (let k = 0; k < BODY_U.length; k++) {
      const px = x + fx * BODY_U[k] * s;
      const pz = z + fz * BODY_U[k] * s;
      if (this.builtAt(px, pz, y, pad) || this.plantNear(px, pz, pad - 0.2) || bikeAt(px, pz, pad)) return false;
      if (!cows) continue;
      for (const q of this.beasts) {
        if (q === b || q.ride?.ridden) continue;
        if (inBody(q.x, q.z, q.yaw, q.size, px, pz, pad + 0.1)) return false;
        if (q.doing === 'amble' && inBody(q.tx, q.tz, Math.atan2(q.tx - q.x, q.tz - q.z), q.size, px, pz, pad + 0.1)) return false;
      }
    }
    return true;
  }

  /** A heading near `yaw` its body stands clear at (x, z), or NaN. */
  private freeYaw(b: Beast, x: number, z: number, yaw: number): number {
    for (let k = 0; k < 8; k++) {
      const a = yaw + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.79;
      if (this.bodyFree(b, x, z, a, true)) return a;
    }
    return NaN;
  }

  /** One of his garden's plants within its room (and `r`) of (x, z). */
  plantNear(x: number, z: number, r: number): boolean {
    for (const p of GARDEN.plants) {
      if (p.at !== 'home' || p.dead) continue;
      const k = KINDS[p.kind];
      const room = isTree(k) ? Math.max(0.4, trunkAt(k, stageOf(k, p.age))) + 0.5 : k.room * 0.5 + 0.35;
      const dx = p.x - x;
      const dz = p.z - z;
      const rr = room + r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  /** Another cow of his already stands or means to stand there. */
  private otherNear(b: Beast, x: number, z: number): boolean {
    for (const q of this.beasts) {
      if (q === b || !q.cow) continue;
      const dx = q.x - x;
      const dz = q.z - z;
      if (dx * dx + dz * dz < 4.4) return true;
    }
    return false;
  }

  /** The ground's top at (x, z) for a cow come from `y` (the walk map: decks, the pen's floor), else the land. */
  private groundY(x: number, z: number, y: number): number {
    const f = this.world.field.heightAt(x, z);
    const s = this.world.standAt?.(x, z, Math.max(y, f) + 0.6, 0.9, 1.2);
    return s !== undefined && Number.isFinite(s) && Math.abs(s - f) < 2.5 ? s : f;
  }

  /**
   * The walk map a cow's size (the search's world): the room over it, its four sides at `COW_HALF` (no squeezing
   * between posts), none of his garden's plants, none of what he has built (its solids: a fence, the pen's rails).
   */
  private cowStand(x: number, z: number, y: number, up: number, h: number): number {
    const sa = this.world.standAt;
    const room = Math.max(h, COW_ROOM);
    const g = sa ? sa(x, z, y, up, room) : this.world.groundAt(x, z) <= y + up ? this.world.groundAt(x, z) : NaN;
    if (Number.isNaN(g)) return NaN;
    if (sa)
      for (let k = 0; k < 4; k++) {
        const px = x + (k === 0 ? COW_HALF : k === 1 ? -COW_HALF : 0);
        const pz = z + (k === 2 ? COW_HALF : k === 3 ? -COW_HALF : 0);
        // (a wall or a post at its side: no; a land step under one side is not a wall: it hops up and down those)
        if (Number.isNaN(sa(px, pz, y, up, room))) return NaN;
      }
    if (this.plantNear(x, z, 0.25)) return NaN;
    // (a wide berth: its long body swings round as it turns at a corner of its way)
    if (this.builtAt(x, z, g, 0.6) || bikeAt(x, z, 0.5)) return NaN;
    return g;
  }

  /** In a solid part of something he has built (its boxes, `margin` m round them). */
  private builtAt(x: number, z: number, y: number, margin: number): boolean {
    for (const p of BUILT.list) {
      const dx = x - p.x;
      const dz = z - p.z;
      const spec = PIECES[p.id];
      const reach = Math.max(spec.w, spec.d) * 0.75 + 1 + margin;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (y > p.y + spec.h + 0.2) continue;
      // (into the piece's frame)
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      for (const [sx, sz, w, d] of spec.solids) if (Math.abs(lx - sx) < w / 2 + margin && Math.abs(lz - sz) < d / 2 + margin) return true;
    }
    return false;
  }

  // ── Ways ───────────────────────────────────────────────────────────────────

  /**
   * Find its way to its goal: in a pen and going elsewhere, out through the gate first (`gate`, when the lane is
   * free); a straight line if it walks (or hops) it, else the search (one at a time; the others wait their turn). Into
   * a pen the way goes to the gate's outside: the lane in is its turn there (`gateStep`).
   */
  private plan(b: Beast): void {
    b.wn = b.wi = 0;
    b.at = false;
    const inPen = this.penIn(b);
    if (inPen && (b.goal !== 'pen' || this.penFor(b)?.uid !== inPen.uid)) {
      b.doing = 'gate';
      b.lane = 0;
      return;
    }
    if (inPen) {
      // (back to its place in the pen it is in: it never turns in there)
      const g = _pa;
      this.slotLocal(b, g);
      this.pushLocal(b, inPen, g.x, g.z, g.face);
      b.lane = 1;
      b.doing = 'way';
      return;
    }
    this.unpen(b);
    let tx: number;
    let tz: number;
    if (b.goal === 'pen') {
      const pen = this.penFor(b);
      if (!pen) return;
      b.penUid = pen.uid;
      const gate = PIECES.pen.pen!.gate;
      [tx, tz] = pieceToWorld(pen, gate[0], gate[1] + GATE_OUT, _pw);
    } else if (b.goal === 'stake' && b.cow) {
      this.patch(b, 2, true);
      tx = b.tx;
      tz = b.tz;
    } else {
      const g = _pa;
      if (!this.goalPoint(b, g)) return;
      tx = g.x;
      tz = g.z;
    }
    const y = lineWalk(this.cowWorld, b.x, b.y, b.z, tx, tz, true);
    if (!Number.isNaN(y)) {
      this.stats.straight++;
      this.push(b, tx, tz);
      b.doing = 'way';
      return;
    }
    // (the search: queued)
    b.searching = true;
    b.doing = 'wait';
    b.tx = tx;
    b.tz = tz;
    if (!this.queue.includes(b) && this.searchFor !== b) this.queue.push(b);
  }

  /** A point of its way (m), walked to facing the way it goes (`face` NaN) or facing `face` (the pen's lane). */
  private push(b: Beast, x: number, z: number, face = NaN): void {
    if (b.wn >= b.wx.length) return;
    b.wx[b.wn] = x;
    b.wz[b.wn] = z;
    b.wy[b.wn] = NaN;
    b.wf[b.wn] = face;
    b.wn++;
  }

  /** A point of the pen's lane (its frame), facing `face` (local) there. */
  private pushLocal(b: Beast, pen: PenAt, lx: number, lz: number, face: number): void {
    pieceToWorld(pen, lx, lz, _pw);
    this.push(b, _pw[0], _pw[1], pen.yaw + face);
  }

  /**
   * Before its pen's gate: going in, its turn when the lane is free — it turns on the spot to face in, walks in facing
   * the trough and steps sideways to the first free place —; going out, its turn when the lane is free and (a far
   * place) the place by the lane on its side is empty: it steps sideways to the lane and backs out past the gate.
   */
  private gateStep(b: Beast, dt: number): void {
    b.speed = 0;
    b.rest = 0;
    b.turn = 0;
    const out = this.penIn(b);
    const pen = out ?? this.penOf(b.penUid);
    if (!pen || (!out && b.goal !== 'pen')) {
      // (taken down meanwhile, or no longer wanted there: on its way again)
      this.unpen(b);
      b.doing = 'stand';
      b.until = this.time + 0.5;
      return;
    }
    if (!this.seen(b.x, b.z)) {
      this.home(b, false);
      return;
    }
    b.head = 0.2;
    for (const q of this.beasts) if (q !== b && q.lane && q.penUid === pen.uid) return;
    const gate = PIECES.pen.pen!.gate;
    const g = _pa;
    if (out) {
      const inner = PEN_INNER[b.penSlot] ?? -1;
      if (inner >= 0) for (const q of this.beasts) if (q !== b && q.penUid === pen.uid && q.penSlot === inner) return;
      // (and nobody standing before the gate, where it backs out to)
      pieceToWorld(pen, gate[0], gate[1] + GATE_OUT, _pw);
      for (const q of this.beasts) if (q !== b && !q.ride?.ridden && Math.hypot(q.x - _pw[0], q.z - _pw[1]) < 1 + 1.1 * (q.size + b.size)) return;
      this.slotLocal(b, g);
      b.wn = b.wi = 0;
      this.pushLocal(b, pen, gate[0], g.z, g.face);
      this.pushLocal(b, pen, gate[0], gate[1] + GATE_OUT, Math.PI);
      b.lane = 2;
      b.doing = 'way';
      return;
    }
    // (not quite at the gate's outside — the search's nearest —: up to it first, if it can)
    pieceToWorld(pen, gate[0], gate[1] + GATE_OUT, _pw);
    const gx = _pw[0];
    const gz = _pw[1];
    if (Math.hypot(gx - b.x, gz - b.z) > 0.4) {
      b.wn = b.wi = 0;
      if (Number.isNaN(lineWalk(this.cowWorld, b.x, b.y, b.z, gx, gz, true))) {
        this.unpen(b);
        b.noPenUntil = this.time + NO_PEN_RETRY;
        b.doing = 'stand';
        b.until = this.time + 2;
        return;
      }
      this.push(b, gx, gz);
      b.doing = 'way';
      return;
    }
    const want = pen.yaw + Math.PI;
    const da = wrap(want - b.yaw);
    if (Math.abs(da) > 0.03) {
      // (stepping round on the spot)
      b.yaw += Math.sign(da) * Math.min(Math.abs(da), GATE_TURN * dt);
      b.speed = 0.12;
      b.head = 0.1;
      return;
    }
    b.yaw = want;
    this.claimSlot(b, pen);
    this.slotLocal(b, g);
    b.wn = b.wi = 0;
    this.pushLocal(b, pen, gate[0], g.z, Math.PI);
    this.pushLocal(b, pen, g.x, g.z, g.face);
    b.lane = 1;
    b.doing = 'way';
  }

  /** The search, a slice a step: when it has found the way, the beast walks it. */
  private searchStep(): void {
    if (!this.searchFor) {
      const b = this.queue.shift();
      if (!b) return;
      if (!this.beasts.includes(b) || !b.searching) return;
      this.searchFor = b;
      const sx = b.wn ? b.wx[b.wn - 1] : b.x;
      const sz = b.wn ? b.wz[b.wn - 1] : b.z;
      this.search.start(this.cowWorld, sx, b.y, sz, b.tx, this.groundY(b.tx, b.tz, b.y), b.tz, 260);
      this.stats.searches++;
    }
    const b = this.searchFor;
    const st = this.search.step(120);
    if (st === 'busy') return;
    this.searchFor = null;
    b.searching = false;
    if (!this.beasts.includes(b)) return;
    // (to a pen's gate only all the way: its nearest — below it, past a land step — is no way in)
    const short = st === 'near' && b.goal === 'pen' && !this.reaches(b);
    if (!short && (st === 'found' || st === 'near')) {
      const p = this.search.path;
      for (let k = 1; k < p.count; k++) {
        if (b.wn >= b.wx.length) break;
        b.wx[b.wn] = p.x[k];
        b.wy[b.wn] = p.y[k];
        b.wz[b.wn] = p.z[k];
        b.wf[b.wn] = NaN;
        b.wn++;
      }
      if (st === 'found') this.push(b, b.tx, b.tz);
      b.doing = 'way';
      return;
    }
    // (no way: it stays where it is, at its goal's nearest, and tries again later; out of sight it is simply there; no
    // way to its pen, it spends the night at its stake, trying again a good while later)
    this.stats.failed++;
    if (b.goal === 'pen') b.noPenUntil = this.time + NO_PEN_RETRY;
    b.doing = 'stand';
    b.until = this.time + 20;
    // (at its stake only if it is by it: else its rope would reach across the land)
    const stake = b.cow ? STAKES[b.cow.stake] : null;
    b.at = b.goal === 'stake' && !!stake && Math.hypot(b.x - stake[0], b.z - stake[1]) < ROPE + 1;
  }

  /** The search's way ends at its target (the pen's gate's outside), on its level. */
  private reaches(b: Beast): boolean {
    const p = this.search.path;
    if (!p.count) return false;
    const k = p.count - 1;
    return Math.hypot(p.x[k] - b.tx, p.z[k] - b.tz) < 1.5 && Math.abs(p.y[k] - this.groundY(b.tx, b.tz, p.y[k])) < 0.8;
  }

  // ── Each step ──────────────────────────────────────────────────────────────

  /**
   * One step (s): every animal does what it does, the trader's posts are filled again, the search goes on. `clock`
   * the time of day; (ex, ey, ez) him (`roaming` false: the map from above), the camera's (x, z).
   */
  tick(dt: number, clock: number, ex: number, ey: number, ez: number, roaming: boolean, camX: number, camZ: number): void {
    this.time += dt;
    this.ex = ex;
    this.ey = ey;
    this.ez = ez;
    this.roaming = roaming;
    this.camX = camX;
    this.camZ = camZ;
    this.sounds.moo = this.sounds.calf = this.sounds.munch = 0;
    this.searchStep();
    for (let k = this.beasts.length - 1; k >= 0; k--) {
      const b = this.beasts[k];
      this.step(b, dt, clock);
    }
    // (another animal at an emptied post, while he is not looking: far off, or the post out of his sight behind him)
    for (let k = 0; k < 3; k++) {
      if (this.restockAt[k] < 0 || this.time < this.restockAt[k]) continue;
      const px = POSTS_AT[k][0];
      const pz = POSTS_AT[k][1];
      if (!this.still && (Math.hypot(px - camX, pz - camZ) < 70 || (roaming && Math.hypot(px - ex, pz - ez) < 70))) continue;
      this.restockAt[k] = -1;
      if (!this.beasts.some((b) => b.post === k)) this.addTraders(k);
    }
  }

  /** Seen: near him (roaming) or the camera. */
  private seen(x: number, z: number): boolean {
    if (this.still) return false;
    const dc = Math.hypot(x - this.camX, z - this.camZ);
    const de = this.roaming ? Math.hypot(x - this.ex, z - this.ez) : Infinity;
    return Math.min(dc, de) < SEEN;
  }

  private step(b: Beast, dt: number, clock: number): void {
    const r = b.ride;
    // Ridden: the ride moves it; it is only drawn (`draw`).
    if (r && r.ridden) {
      b.wasRidden = true;
      b.x = r.x;
      b.y = r.y;
      b.z = r.z;
      b.yaw = r.yaw;
      b.food = null;
      b.doing = 'stand';
      return;
    }
    if (b.wasRidden) {
      // (let go: from where the ride left it, back to where it belongs)
      b.wasRidden = false;
      if (r) {
        b.x = r.x;
        b.y = r.y;
        b.z = r.z;
        b.yaw = r.yaw;
      }
      this.unpen(b);
      b.goal = this.goalNow(b, clock);
      b.doing = 'stand';
      b.until = this.time + 1.5;
      b.rest = 0;
      // (the map from above, or out of everyone's sight: it is home at once)
      if (!this.roaming || !this.seen(b.x, b.z)) {
        b.at = false;
        this.home(b, false);
        return;
      }
      b.at = false;
      b.wn = b.wi = 0;
    }
    // Its size grows with it (and a thin one is a little smaller).
    if (b.cow) {
      const s = sizeOf(b.cow);
      b.size += (s - b.size) * Math.min(1, dt * 0.5);
      this.setCoat(b);
    }
    const goal = this.goalNow(b, clock);
    if (goal !== b.goal) {
      b.goal = goal;
      b.at = false;
      b.wn = b.wi = 0;
      b.searching = false;
      b.food = null;
      if (!this.seen(b.x, b.z)) {
        this.home(b, false);
        return;
      }
      b.doing = 'stand';
      b.until = this.time + 0.8 + 2.2 * hash3(b.i, 17, Math.floor(this.time), 7110);
      b.rest = 0;
    }
    // Not there yet: a short stand (it looks round, gets up), then the way.
    if (!b.at) {
      if (b.doing === 'stand' || b.doing === 'lie') {
        b.speed = 0;
        b.rest = 0;
        b.head = 0;
        if (this.time < b.until || b.searching) return;
        // (out of everyone's sight it is simply there)
        if (!this.seen(b.x, b.z)) this.home(b, false);
        else this.plan(b);
        return;
      }
      if (b.doing === 'wait') {
        b.speed = 0;
        b.head = 0.2;
        // (out of everyone's sight while it waits for the search: it is simply there)
        if (!this.seen(b.x, b.z) && !b.searching) this.home(b, false);
        return;
      }
      if (b.doing === 'gate') {
        this.gateStep(b, dt);
        return;
      }
      this.walk(b, dt, clock);
      return;
    }
    // There: what it does at its place.
    if (b.leaving) this.waitSold(b);
    else if (b.goal === 'pen') this.inPen(b, dt, clock);
    else if (b.goal === 'post') this.atPost(b, dt, clock);
    else this.atStake(b, dt, clock);
  }

  /** Along its way: walking, stopping for him in its way, up and down the land's steps (eased). */
  private walk(b: Beast, dt: number, clock: number): void {
    if (b.wi >= b.wn) {
      b.speed = 0;
      if (b.lane === 2) {
        // (out of its pen, past the gate: on to where it goes)
        this.unpen(b);
        this.plan(b);
        return;
      }
      if (b.goal === 'pen' && !this.penIn(b)) {
        // (at the gate's outside: its turn to go in)
        b.doing = 'gate';
        return;
      }
      b.lane = 0;
      b.at = true;
      b.doing = b.goal === 'pen' ? 'stand' : 'graze';
      b.until = this.time + 2 + 4 * hash3(b.i, 19, Math.floor(this.time), 7111);
      // (sold: gone once nobody sees it; till then it waits there, grazing)
      if (b.leaving && !this.seen(b.x, b.z)) this.drop(b);
      void clock;
      return;
    }
    const tx = b.wx[b.wi];
    const tz = b.wz[b.wi];
    const dx = tx - b.x;
    const dz = tz - b.z;
    const d = Math.hypot(dx, dz);
    const hold = b.wf[b.wi];
    if (!Number.isNaN(hold)) {
      this.laneLeg(b, dt, tx, tz, d, hold);
      return;
    }
    // (another animal right before it: it waits behind; one that stays where it is or is held up itself, it goes round
    // after a while — the lower slot first, so two waiting for each other never wait for ever —; a moment after going
    // round it does not stop for them)
    const o = b.waitCow < 0 ? null : this.cowAhead(b);
    if (o) {
      b.speed = 0;
      b.head = 0.1;
      b.waitCow += dt;
      const queue = o.doing === 'gate' || o.lane !== 0 || o.queued;
      b.queued = queue;
      const held = o.doing !== 'way' || o.waitCow > 0.4 || Math.abs(o.speed) < 0.05;
      const after = o.doing !== 'way' ? 3.5 : b.i < o.i ? 1.5 : 5;
      if (!queue && held && b.waitCow > after) {
        if (this.goRound(b, o.x, o.z, 0.9 + BODY_HALF * (o.size + b.size), BODY_FRONT * o.size * 0.5)) b.waitCow = -3;
        // (no room to go round: the lower slot pushes on, a moment, all the same)
        else if (b.i < o.i && b.waitCow > after + 6) b.waitCow = -2;
      }
      // (out of everyone's sight a long while: it is simply there)
      if (b.waitCow > 25 && !this.seen(b.x, b.z)) this.home(b, false);
      return;
    }
    b.queued = false;
    if (b.waitCow > 0) b.waitCow = 0;
    else if (b.waitCow < 0) b.waitCow = Math.min(0, b.waitCow + dt);
    // (his bicycle left in its way after it set off: round it; no room round it, it waits)
    if (b.waitCow >= 0 && BIKE_OWN.kind && !BIKE_OWN.riding) {
      const fx = Math.sin(b.yaw);
      const fz = Math.cos(b.yaw);
      for (let k = 0; k < AHEAD_U.length; k++)
        if (bikeAt(b.x + fx * AHEAD_U[k] * b.size, b.z + fz * AHEAD_U[k] * b.size, 0.15 + BODY_HALF * b.size)) {
          if (this.goRound(b, BIKE_OWN.x, BIKE_OWN.z, 1.0 + BODY_HALF * b.size, 0.3)) {
            b.waitCow = -3;
            break;
          }
          b.speed = 0;
          b.waitCow += dt;
          if (b.waitCow > 25 && !this.seen(b.x, b.z)) this.home(b, false);
          return;
        }
    }
    // (him in its way, right before its nose: it stops and waits, its head up; a few seconds and it goes round him)
    if (this.roaming) {
      const fx = Math.sin(b.yaw);
      const fz = Math.cos(b.yaw);
      const hx = this.ex - b.x;
      const hz = this.ez - b.z;
      const along = hx * fx + hz * fz;
      const across = hx * fz - hz * fx;
      if (b.blocked >= 0 && along > 0 && along < 0.9 + OX_NOSE * b.size && Math.abs(across) < 0.45 * b.size + 0.55 && Math.abs(this.ey - b.y) < 2) {
        b.speed = 0;
        b.head = -0.3;
        b.blocked += dt;
        if (b.blocked > 3 && b.wn < b.wx.length) {
          // (a way round him on the side away from him — past him, then on its way —, and a moment not stopping for him)
          b.blocked = -4;
          this.goRound(b, this.ex, this.ez, 1.1 + 0.8 * b.size, 0.4);
        }
        return;
      }
    }
    // (going round him: a few seconds it does not stop for him)
    b.blocked = b.blocked < 0 ? Math.min(0, b.blocked + dt) : 0;
    const pace = (b.cow && ageOf(b.cow) === 'calf' ? WALK * 1.1 : WALK) * Math.min(1.15, 0.75 + 0.3 * (b.size / 1.4));
    b.speed = pace;
    b.head = 0.15;
    b.rest = 0;
    if (d < 0.25) {
      b.wi++;
      return;
    }
    const step = Math.min(d, pace * dt);
    b.x += (dx / d) * step;
    b.z += (dz / d) * step;
    // (turning into the way, not snapping)
    const want = Math.atan2(dx, dz);
    let da = want - b.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    b.yaw += da * Math.min(1, dt * 3.2);
    const wy = b.wy[b.wi];
    const gy = Number.isNaN(wy) ? this.groundY(b.x, b.z, b.y) : this.groundY(b.x, b.z, Math.max(b.y, wy));
    b.y += (gy - b.y) * Math.min(1, dt * 5);
  }

  /**
   * A point of its way round something at (ox, oz) before it, `side` m to the side away from it and `ahead` m on
   * (where it can stand), then on its way; false if neither side will do.
   */
  private goRound(b: Beast, ox: number, oz: number, side: number, ahead: number): boolean {
    if (b.wn >= b.wx.length) return false;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const across = (ox - b.x) * fz - (oz - b.z) * fx;
    const first = across > 0 ? -1 : 1;
    for (const sd of [first, -first]) {
      const px = ox + fz * sd * side + fx * ahead;
      const pz = oz - fx * sd * side + fz * ahead;
      if (Number.isNaN(lineWalk(this.cowWorld, b.x, b.y, b.z, px, pz, true))) continue;
      for (let k = b.wn; k > b.wi; k--) {
        b.wx[k] = b.wx[k - 1];
        b.wy[k] = b.wy[k - 1];
        b.wz[k] = b.wz[k - 1];
        b.wf[k] = b.wf[k - 1];
      }
      b.wx[b.wi] = px;
      b.wy[b.wi] = NaN;
      b.wz[b.wi] = pz;
      b.wf[b.wi] = NaN;
      b.wn++;
      return true;
    }
    return false;
  }

  /** Another animal right before it as it walks on (its body over the points before its chest and nose), or null. */
  private cowAhead(b: Beast): Beast | null {
    for (const q of this.beasts) {
      if (q === b || q.ride?.ridden) continue;
      const dx = q.x - b.x;
      const dz = q.z - b.z;
      if (dx * dx + dz * dz > 64) continue;
      if (!this.hits(b, q)) continue;
      // (two walking into each other: the one with the lower slot goes on, the other waits)
      if (q.i > b.i && q.doing === 'way' && Math.abs(q.speed) > 0.05 && this.hits(q, b)) continue;
      return q;
    }
    return null;
  }

  /** The points before `a` as it walks on fall in `o`'s body. */
  private hits(a: Beast, o: Beast): boolean {
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const pad = 0.1 + BODY_HALF * a.size * 0.8;
    for (let k = 0; k < AHEAD_U.length; k++) {
      const u = AHEAD_U[k] * a.size;
      if (inBody(o.x, o.z, o.yaw, o.size, a.x + fx * u, a.z + fz * u, pad)) return true;
    }
    return false;
  }

  /**
   * A leg of the pen's lane, facing held (`hold`): walking in, stepping sideways to its place or back to the lane,
   * backing out; it waits while he stands where it goes.
   */
  private laneLeg(b: Beast, dt: number, tx: number, tz: number, d: number, hold: number): void {
    if (d < 0.03) {
      b.x = tx;
      b.z = tz;
      b.wi++;
      return;
    }
    b.yaw += wrap(hold - b.yaw) * Math.min(1, dt * 2.5);
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const mx = (tx - b.x) / d;
    const mz = (tz - b.z) / d;
    const along = mx * fx + mz * fz;
    const pace = along > 0.7 ? LANE_PACE : along < -0.7 ? BACK : SHUFFLE;
    if (this.roaming && Math.abs(this.ey - b.y) < 2) {
      // (its leading end: the nose walking in, its middle sideways, the rump backing out)
      const lead = (along > 0.7 ? BODY_FRONT : along < -0.7 ? -BODY_BACK : 0.4) * b.size;
      const lx = b.x + fx * lead + mx * 0.5;
      const lz = b.z + fz * lead + mz * 0.5;
      if (Math.hypot(this.ex - lx, this.ez - lz) < 0.7 + 0.4 * b.size) {
        b.speed = 0;
        b.head = -0.3;
        return;
      }
    }
    const st = Math.min(d, pace * dt);
    b.x += mx * st;
    b.z += mz * st;
    b.speed = along < -0.7 ? -pace : pace;
    b.head = 0.15;
    b.rest = 0;
    b.y += (this.groundY(b.x, b.z, b.y) - b.y) * Math.min(1, dt * 5);
  }

  /** At its stake: grazing round it, ambling to a fresh patch, looking up, lowing; lying through the night with no pen; eating what he brought. */
  private atStake(b: Beast, dt: number, clock: number): void {
    const night = inHours(clock, LIE_HOURS);
    if (b.food) {
      this.eat(b, dt);
      return;
    }
    b.speed = 0;
    // (a plant of his or something he built put where it stands: it gets up and moves off, day or night)
    if (this.time >= b.checkAt) {
      b.checkAt = this.time + 2.5;
      if (b.doing !== 'amble' && !this.bodyFree(b, b.x, b.z, b.yaw, false)) {
        this.patch(b, Math.floor(this.time));
        if (b.tx !== b.x || b.tz !== b.z) {
          b.doing = 'amble';
          b.rest = 0;
        }
      }
    }
    if (b.doing === 'amble' && (night || b.rest > 0)) {
      this.amble(b, dt);
      return;
    }
    if (night) {
      b.rest = 1;
      b.head = (b.i & 1) === 0 ? 0.4 : 0;
      b.doing = 'lie';
      this.low(b, 3);
      return;
    }
    b.rest = 0;
    const thin = b.cow ? condOf(b.cow) < THIN : false;
    // (him close by: it stops where it is and turns its head to him — a hungry one waits for its food)
    const dx = this.ex - b.x;
    const dz = this.ez - b.z;
    const close = this.roaming && dx * dx + dz * dz < 16 && Math.abs(this.ey - b.y) < 2;
    if (close) {
      const a = Math.atan2(dx, dz) - b.yaw;
      const rel = Math.atan2(Math.sin(a), Math.cos(a));
      b.turn = Math.abs(rel) < 2.2 ? Math.max(-1, Math.min(1, rel / 0.9)) : 0;
      if (b.doing === 'amble') {
        b.doing = 'stand';
        b.until = this.time + 3;
      }
    } else b.turn = 0;
    if (b.doing === 'amble') {
      this.amble(b, dt);
      return;
    }
    if (b.doing === 'low') {
      b.head = -1;
      if (this.time >= b.until) {
        b.doing = 'graze';
        b.until = this.time + 6 + 8 * hash3(b.i, 29, Math.floor(this.time), 7113);
      }
      return;
    }
    // Grazing (head down) or standing a moment (head level: chewing, looking round).
    b.head = b.doing === 'stand' ? (thin ? 0.45 : 0) : GRAZE;
    if (this.time >= b.until) {
      const r = hash3(b.i, 37, Math.floor(this.time * 3), 7114);
      if (r < 0.45) {
        this.patch(b, Math.floor(this.time));
        b.doing = 'amble';
      } else if (r < 0.75) {
        b.doing = 'stand';
        b.until = this.time + 3 + 5 * r;
      } else {
        b.doing = 'graze';
        b.until = this.time + 8 + 14 * r;
      }
    }
    this.low(b, b.cow && hungry(b.cow) ? 0.35 : 1);
  }

  /** Sold, by the trader's trough: grazing there (no rope: untied) until nobody sees it, then it is gone. */
  private waitSold(b: Beast): void {
    b.speed = 0;
    b.rest = 0;
    b.turn = 0;
    b.doing = 'graze';
    b.head = GRAZE;
    if (!this.seen(b.x, b.z)) this.drop(b);
  }

  /** Ambling to its fresh patch (`tx, tz`): turned toward it first (stepping round), then on; another cow come before it, it stops. */
  private amble(b: Beast, dt: number): void {
    b.rest = 0;
    const dx = b.tx - b.x;
    const dz = b.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      b.doing = 'graze';
      b.until = this.time + 9 + 16 * hash3(b.i, 23, Math.floor(this.time), 7112);
      return;
    }
    const da = wrap(Math.atan2(dx, dz) - b.yaw);
    b.yaw += Math.sign(da) * Math.min(Math.abs(da), AMBLE_TURN * dt);
    if (Math.abs(da) > 0.45) {
      b.speed = 0.12;
      b.head = 0.6;
      return;
    }
    if (this.cowAhead(b)) {
      b.doing = 'graze';
      b.until = this.time + 6;
      return;
    }
    const st = Math.min(d, AMBLE * dt);
    b.x += (dx / d) * st;
    b.z += (dz / d) * st;
    b.y += (this.groundY(b.x, b.z, b.y) - b.y) * Math.min(1, dt * 5);
    b.speed = AMBLE;
    b.head = 1;
  }

  /** Its body turning on the spot at (x, z) from `from` to `to` (the shorter way) stays clear (`bodyFree`). */
  private sweepFree(b: Beast, x: number, z: number, from: number, to: number): boolean {
    const da = wrap(to - from);
    const n = Math.ceil(Math.abs(da) / 0.35);
    for (let k = 1; k <= n; k++) if (!this.bodyFree(b, x, z, from + (da * k) / n, true)) return false;
    return true;
  }

  /** Now and then it lifts its head and lows (`every`: × the usual wait; a hungry one more often). */
  private low(b: Beast, every: number): void {
    if (this.time < b.lowAt) return;
    b.lowAt = this.time + (35 + 55 * hash3(b.i, 41, Math.floor(this.time), 7115)) * every;
    if (b.rest > 0.5 || this.still) return;
    b.doing = 'low';
    b.until = this.time + 1.9;
    const d = Math.hypot(b.x - (this.roaming ? this.ex : this.camX), b.z - (this.roaming ? this.ez : this.camZ));
    const g = Math.max(0, 1 - d / 70);
    if (g <= 0) return;
    if (b.size < 1.0) this.sounds.calf = Math.max(this.sounds.calf, g);
    else this.sounds.moo = Math.max(this.sounds.moo, g * (b.post >= 0 ? 0.8 : 1));
  }

  /** Eating the heap he laid down: head down to it, chewing; the heap goes down; done, it grazes again. */
  private eat(b: Beast, dt: number): void {
    b.speed = 0;
    b.head = GRAZE;
    b.doing = 'eat';
    b.left -= dt / EAT_S;
    // (a mouthful pulled from the heap and chewed: its crunch now and then, heard near it)
    if (this.time >= b.munchAt) {
      b.munchAt = this.time + 1.1 + 0.9 * hash3(b.i, Math.floor(this.time * 3), 43, 7116);
      const d = Math.hypot(b.x - this.ex, b.z - this.ez);
      if (this.roaming && d < 18 && !this.still) this.sounds.munch = Math.max(this.sounds.munch, 1 - d / 18);
    }
    if (b.left <= 0) {
      b.food = null;
      b.left = 0;
      b.doing = 'stand';
      b.until = this.time + 4;
    }
  }

  /** In the pen: at its place, facing the trough, standing a while, then lying down for the night. */
  private inPen(b: Beast, dt: number, clock: number): void {
    b.speed = 0;
    if (b.food) {
      this.eat(b, dt);
      return;
    }
    const late = !inHours(clock, [0.21, 0.27]);
    if (b.doing === 'stand' && this.time >= b.until) b.doing = 'lie';
    b.rest = b.doing === 'lie' || late ? 1 : 0;
    b.head = b.rest ? 0.3 : 0.6;
    this.low(b, 3);
  }

  /** At the trader's post: grazing, looking up at him when he comes near, lying down at night. */
  private atPost(b: Beast, dt: number, clock: number): void {
    b.speed = 0;
    const night = inHours(clock, [0.33, 0.73]);
    b.rest = night ? 1 : 0;
    const near = this.roaming && Math.hypot(b.x - this.ex, b.z - this.ez) < 6;
    if (night) {
      b.head = 0.3;
      return;
    }
    if (b.doing === 'low') {
      b.head = -1;
      if (this.time >= b.until) b.doing = 'graze';
      return;
    }
    if (this.time >= b.until) {
      const r = hash3(b.i, 47, Math.floor(this.time * 2), 7117);
      b.doing = r < 0.6 ? 'graze' : 'stand';
      b.until = this.time + 5 + 9 * r;
      // (a little turn about its post: a step this way or that)
      const p = TRADER_POSTS[b.post];
      const a = p.out + (r - 0.5) * 0.7;
      const dd = OX_NOSE * p.size + 0.5;
      const [x, z] = traderToWorld(p.x + Math.sin(a) * dd, p.z + Math.cos(a) * dd);
      b.tx = x;
      b.tz = z;
    }
    // (easing to its spot by the post, facing the post)
    const dx = b.tx - b.x;
    const dz = b.tz - b.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.02 && b.tx !== 0) {
      const st = Math.min(d, 0.25 * dt);
      b.x += (dx / d) * st;
      b.z += (dz / d) * st;
      b.speed = d > 0.05 ? 0.25 : 0;
    }
    const px = POSTS_AT[b.post][0];
    const pz = POSTS_AT[b.post][1];
    const want = Math.atan2(px - b.x, pz - b.z);
    let da = want - b.yaw;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    b.yaw += da * Math.min(1, dt * 1.5);
    b.head = near ? 0 : b.doing === 'graze' ? GRAZE : 0.2;
    this.low(b, 1.6);
  }

  // ── Feeding (the add-on) ───────────────────────────────────────────────────

  /** He laid a heap of straw or grass before its nose: it eats (`left` 1, or less: a check's moment). */
  feed(b: Beast, what: 'straw' | 'grass', left = 1): void {
    b.food = what;
    b.left = left;
    b.doing = 'eat';
    b.speed = 0;
  }

  /** Its nose's point on the ground (m), where its food goes, into `out`. */
  nose(b: Beast, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const d = OX_NOSE * b.size + 0.12;
    out.x = b.x + Math.sin(b.yaw) * d;
    out.z = b.z + Math.cos(b.yaw) * d;
    out.y = this.groundY(out.x, out.z, b.y);
    return out;
  }

  /** The beast of his cow. */
  of(c: Cow): Beast | null {
    for (const b of this.beasts) if (b.cow === c) return b;
    return null;
  }

  /** Put every one where it belongs now (a check's still, back from the map). */
  settle(clock: number): void {
    for (let k = this.beasts.length - 1; k >= 0; k--) {
      const b = this.beasts[k];
      if (b.ride?.ridden) continue;
      if (b.leaving) this.drop(b);
      else this.unpen(b);
    }
    // (in the herd's order: the first ones get the pen's far places)
    for (const b of this.beasts) {
      if (b.ride?.ridden) continue;
      b.goal = this.goalNow(b, clock);
      this.home(b, true);
      b.food = null;
      if (b.goal === 'pen' || inHours(clock, LIE_HOURS) || (b.post >= 0 && inHours(clock, [0.33, 0.73]))) {
        b.rest = 1;
        b.doing = 'lie';
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private setCoat(b: Beast): void {
    if (!b.cow) return;
    const thin = condOf(b.cow) < THIN;
    const key = b.cow.look * 2 + (thin ? 1 : 0);
    if (key === b.coat) return;
    b.coat = key;
    this.flock.setup(b.i, coatVariant(b.cow.look), ((b.cow.id * 0.618) % 1 + 1) % 1, coatTint(b.cow.look) * (thin ? 0.9 : 1));
  }

  /** Every frame: each animal placed and posed, the ropes, stakes and heaps, the shader's clock; the people's obstacles. */
  draw(camera: Camera, calls: AnimalCall[] | null, listenerX: number, listenerZ: number): void {
    const fl = this.flock;
    const t = this.time;
    const e = camera.matrixWorld.elements;
    const cx = e[12];
    const cz = e[14];
    const bl = this.blocks;
    bl.begin();
    let n = 0;
    const O = CATTLE_OBSTACLES;
    for (const b of this.beasts) {
      const far = Math.hypot(b.x - cx, b.z - cz) > FAR;
      if (far) {
        fl.hide(b.i);
        continue;
      }
      const r = b.ride;
      // (ridden: as the ride has it, every frame — its tilt, its step phase, trotting, lying, getting up: people/_oxRide.ts)
      if (r && r.ridden) drawRideCow(fl, b.i, r, t);
      else {
        fl.place(b.i, b.x, b.y, b.z, b.yaw, b.size);
        // (backing out of the pen: its speed below 0, the steps the other way)
        const sp = Math.abs(b.speed);
        const walk = sp > 0.02 ? (sp > 0.5 ? 1 : 0.6) : 0;
        fl.gait(b.i, walk, walk > 0 ? hzOf(b.speed, b.size) : 0.5, t);
        // (a still: as it is now, not easing toward it)
        const snap = this.still;
        fl.set(b.i, CH.head, b.head, t, snap);
        fl.set(b.i, CH.turn, b.turn, t, snap);
        fl.set(b.i, CH.rest, b.rest, t, snap);
        if (r) this.writeRide(b, r);
      }
      // The rope: from his stake (or the trader's post) to its collar, sagging; his stake.
      this.rope(b);
      // Its heap of food before its nose.
      if (b.food && b.left > 0) this.heap(b);
      if (n < O.x.length) {
        O.x[n] = b.x;
        O.y[n] = b.y;
        O.z[n] = b.z;
        O.r[n] = 0.9 * b.size;
        n++;
      }
      // The bell on its collar: with its steps, now and then while it grazes.
      if (calls && t >= b.bellAt) {
        b.bellAt = t + (b.speed > 0.1 ? 0.9 + 0.5 * hash3(b.i, Math.floor(t * 4), 51, 7118) : 6 + 10 * hash3(b.i, Math.floor(t), 53, 7119));
        const d = Math.hypot(b.x - listenerX, b.z - listenerZ);
        if (d < 60 && b.post !== 1 && b.size >= 0.9) calls.push({ kind: 'cowBell', x: b.x, y: b.y + 1.1 * b.size, z: b.z, gain: b.speed > 0.1 ? 0.6 : 0.38 });
      }
    }
    O.n = n;
    if (this.clump.on) this.drawClump(cx, cz);
    // (his stakes with no cow at them now: still in the ground)
    for (let k = 0; k < STAKES.length; k++) {
      let used = false;
      for (const b of this.beasts) if (b.cow && b.cow.stake === k && !b.leaving) used = true;
      if (used) continue;
      const [sx, sz] = STAKES[k];
      if (Math.hypot(sx - cx, sz - cz) > 160 || !this.anyCow()) continue;
      this.stake(sx, sz);
    }
    bl.end();
    fl.flush(t);
  }

  /** The clump of grass he cuts: blades standing (the fistfuls not cut yet) and the stubble of those cut. */
  private drawClump(cx: number, cz: number): void {
    const c = this.clump;
    if (this.time - c.since > 90 && !this.still) {
      c.on = false;
      return;
    }
    if (Math.hypot(c.x - cx, c.z - cz) > 120) return;
    const n = 16;
    for (let j = 0; j < n; j++) {
      const a = j * 2.39996;
      const d = 0.08 + 0.26 * Math.sqrt((j + 0.5) / n);
      const x = c.x + Math.sin(a) * d;
      const z = c.z + Math.cos(a) * d;
      // (fistful by fistful from the near side: each a quarter of the blades)
      const cut = Math.floor((j * 4) / n) < c.cut;
      const h = cut ? 0.05 + 0.03 * hash3(j, 1, 61, 7120) : 0.42 + 0.22 * hash3(j, 2, 61, 7120);
      const lean = cut ? 0 : (hash3(j, 3, 61, 7120) - 0.5) * 0.5;
      this.blocks.box(x, c.y + h / 2, z, 0.035, h, 0.035, a + c.yaw, lean, GRASS_COL[j % GRASS_COL.length]);
    }
  }

  private anyCow(): boolean {
    for (const b of this.beasts) if (b.cow) return true;
    return false;
  }

  /** His stake: a short peg of wood in the ground, the rope's loop round its top. */
  private stake(x: number, z: number): number {
    const g = this.world.field.heightAt(x, z);
    this.blocks.box(x, g + 0.22, z, 0.09, 0.44, 0.09, 0, 0, STAKE_COL);
    this.blocks.box(x, g + 0.4, z, 0.13, 0.05, 0.13, 0, 0, ROPE_COL);
    return g + 0.4;
  }

  /** The rope from its stake or post to its collar, in three sagging pieces. */
  private rope(b: Beast): void {
    let ax: number;
    let ay: number;
    let az: number;
    if (b.post >= 0) {
      ax = POSTS_AT[b.post][0];
      az = POSTS_AT[b.post][1];
      ay = this.world.field.heightAt(ax, az) + 0.85;
    } else if (b.cow && b.goal === 'stake' && b.at && !b.ride?.ridden && !b.leaving) {
      const st = STAKES[b.cow.stake] ?? STAKES[0];
      ax = st[0];
      az = st[1];
      // (never a rope longer than a rope: one somewhere else is not tied)
      if (Math.hypot(b.x - ax, b.z - az) > ROPE + 2.5) return;
      ay = this.stake(ax, az);
    } else return;
    // (the collar: under its neck, as the model has it, lower when it grazes or lies)
    const s = b.size;
    const down = Math.min(1.6, Math.max(0, b.head)) / 1.6;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    const bx = b.x + fx * (1.0 + 0.12 * down) * s;
    const bz = b.z + fz * (1.0 + 0.12 * down) * s;
    const by = b.y + (1.02 - 0.32 * down - 0.55 * b.rest) * s;
    const dx = bx - ax;
    const dz = bz - az;
    const d = Math.hypot(dx, dz, by - ay);
    const long = b.post >= 0 ? OX_NOSE * TRADER_POSTS[b.post].size + 1.2 : ROPE + 1.6;
    const sag = Math.min(0.9, Math.max(0.04, (long - d) * 0.32));
    let px = ax;
    let py = ay;
    let pz = az;
    for (let k = 1; k <= 3; k++) {
      const u = k / 3;
      const qx = ax + dx * u;
      const qz = az + dz * u;
      let qy = ay + (by - ay) * u - sag * 4 * u * (1 - u);
      const gy = this.world.field.heightAt(qx, qz) + 0.03;
      if (qy < gy) qy = gy;
      this.blocks.rod(px, py, pz, qx, qy, qz, ROPE_W, ROPE_COL);
      px = qx;
      py = qy;
      pz = qz;
    }
  }

  /** The heap it eats from: a few bundles' worth of straw (golden) or grass (green) on the ground before its nose, going down. */
  private heap(b: Beast): void {
    const o = this.nose(b, _nose);
    const k = Math.max(0.15, b.left);
    const cols = b.food === 'grass' ? GRASS_COL : STRAW_COL;
    for (let j = 0; j < 6; j++) {
      const a = j * 2.39996 + b.i;
      const r = j === 0 ? 0 : 0.18 + 0.1 * (j % 2);
      const w = (0.42 - 0.04 * j) * (0.6 + 0.4 * k);
      const h = (0.14 - 0.012 * j) * k + 0.03;
      this.blocks.box(o.x + Math.sin(a) * r * k, o.y + h / 2 + (j === 0 ? 0.04 * k : 0), o.z + Math.cos(a) * r * k, w, h, w * 0.7, b.yaw + a, b.food === 'grass' ? 0.25 * (j % 3) : 0.1, cols[j % cols.length]);
    }
  }

  /**
   * Its ride's fields from where it is: may he get on — grown, standing still (grazing, looking, lowing, eating) or
   * lying down and settled (not on its way down or up), not on a way, not in the pen, room over its back for him to sit
   * up (no low roof: the pen's lean-to, as the ride asks too).
   */
  private writeRide(b: Beast, r: RideCow): void {
    r.x = b.x;
    r.y = b.y;
    r.z = b.z;
    r.yaw = b.yaw;
    r.scale = b.size;
    r.lying = b.rest > 0.5;
    r.head = b.head;
    r.speed = Math.abs(b.speed);
    r.pitch = r.roll = 0;
    if (b.rest !== b.restWas) {
      b.restWas = b.rest;
      b.restAt = this.time;
    }
    const settled = this.time - b.restAt > 1.4 && Math.abs(b.speed) < 0.01;
    let ok = !!b.cow && ageOf(b.cow) === 'grown' && b.at && !b.leaving && b.goal !== 'pen' && settled && (b.doing === 'graze' || b.doing === 'stand' || b.doing === 'low' || b.doing === 'lie' || b.doing === 'eat');
    if (ok && this.world.ceilingAt) {
      const top = b.y + 1.3 * b.size;
      ok = this.world.ceilingAt(b.x, b.z, top - 0.2) >= top + 1.75;
    }
    r.canRide = ok;
  }

  /** Back to the map: nobody rides; every animal where it belongs (its ride's fields too). */
  reset(clock: number): void {
    this.searchFor = null;
    this.search.cancel();
    this.queue.length = 0;
    this.settle(clock);
  }

  /** For checks: each animal now. */
  debug(): object[] {
    return this.beasts.map((b) => ({
      slot: b.i,
      cow: b.cow?.id ?? null,
      post: b.post,
      x: +b.x.toFixed(2),
      y: +b.y.toFixed(2),
      z: +b.z.toFixed(2),
      yaw: +b.yaw.toFixed(2),
      size: +b.size.toFixed(2),
      doing: b.doing,
      goal: b.goal,
      at: b.at,
      way: b.wn - b.wi,
      food: b.food,
      left: +b.left.toFixed(2),
      rest: b.rest,
      ride: b.ride ? { id: b.ride.id, canRide: b.ride.canRide, ridden: b.ride.ridden } : null,
      leaving: b.leaving,
      pen: b.penUid ? `${b.penUid}:${b.penSlot}` : null,
      lane: b.lane,
      waitCow: +b.waitCow.toFixed(1),
      queued: b.queued,
      blocked: +b.blocked.toFixed(1),
      speed: +b.speed.toFixed(2),
    }));
  }

  /** His cows the ride may know (checks). */
  static rideCount(): number {
    return COW_RIDE.cows.filter((c) => c.owner === 'his').length;
  }
}

const _nose = { x: 0, y: 0, z: 0 };
/** The trader's posts on the map (m): they never move. */
const POSTS_AT = TRADER_POSTS.map((p) => traderToWorld(p.x, p.z));
/** The trader's animals' first looks (the plough ox, the calf, the young cow). */
const TRADER_LOOKS = [3, 4, 0];
