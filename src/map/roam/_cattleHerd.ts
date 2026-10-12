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

export type Doing = 'graze' | 'amble' | 'stand' | 'low' | 'eat' | 'lie' | 'way' | 'wait';
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
  wn: number;
  wi: number;
  searching: boolean;
  /** Sold: walks off to the trader, then gone. */
  leaving: boolean;
  /** Eating: straw or grass, how much is left of the heap (0‥1). */
  food: 'straw' | 'grass' | null;
  left: number;
  /** Its pen and its place there (−1: none). */
  pen: number;
  penSlot: number;
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

/** The pen's four places (piece frame: facing the trough at the back, −z), and the lane in through its gate. */
const PEN_SLOTS: readonly (readonly [number, number, number])[] = [
  [-2.35, 0.8, Math.PI - 0.08],
  [-0.78, 0.95, Math.PI + 0.06],
  [0.78, 0.8, Math.PI - 0.05],
  [2.35, 0.95, Math.PI + 0.1],
];
const GATE_OUT = 1.6;
const GATE_IN = 1.1;

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
      goal: 'stake', at: false, wx: new Float32Array(1024), wy: new Float32Array(1024), wz: new Float32Array(1024), wn: 0, wi: 0, searching: false, leaving: false,
      food: null, left: 0, pen: -1, penSlot: -1, bellAt: 0, lowAt: 0, munchAt: 0, wasRidden: false, blocked: 0, restWas: 0, restAt: -10, coat: -1, look: 0,
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
    for (const c of cows) {
      if (this.beasts.some((b) => b.cow === c)) continue;
      const i = this.take();
      if (i < 0) continue;
      const b = this.newBeast(i);
      b.cow = c;
      b.size = sizeOf(c);
      b.ride = rideCow(`own-${c.id}`, 'his');
      addRideCow(b.ride);
      b.lowAt = this.time + 20 + 50 * hash3(c.id, 9, 2, 7103);
      b.bellAt = this.time + 3 + 8 * hash3(c.id, 7, 2, 7104);
      this.beasts.push(b);
      if (snap) this.home(b, true);
    }
    // (a cow sold walks off; one gone from the list another way — a check's — goes at once)
    for (let k = this.beasts.length - 1; k >= 0; k--) {
      const b = this.beasts[k];
      if (!b.cow || cows.includes(b.cow) || b.leaving) continue;
      this.drop(b);
    }
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
    this.sync([c], false);
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
    b.leaving = true;
    b.food = null;
    b.goal = 'trader';
    b.at = false;
    b.pen = -1;
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
    if (inHours(clock, PEN_HOURS) && this.pens() > 0) return 'pen';
    return 'stake';
  }

  /** Its place in a pen (the cows of his in the herd's order, four to a pen), or false. */
  private penPlace(b: Beast): boolean {
    let n = 0;
    for (const q of this.beasts) {
      if (!q.cow || q.leaving) continue;
      if (q === b) break;
      n++;
    }
    const pen = this.penAt(Math.floor(n / 4)) ?? this.penAt(0);
    if (!pen) return false;
    b.pen = BUILT.list.indexOf(pen);
    b.penSlot = n % 4;
    return true;
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
      const [x, z] = traderToWorld(-6.5, -1.5);
      out.x = x;
      out.z = z;
      out.face = traderYaw(Math.PI);
      return true;
    }
    if (b.goal === 'pen' && b.cow && this.penPlace(b)) {
      const pen = BUILT.list[b.pen];
      const s = PEN_SLOTS[b.penSlot];
      pieceToWorld(pen, s[0], s[1], _pw);
      out.x = _pw[0];
      out.z = _pw[1];
      out.face = pen.yaw + s[2];
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
    this.goalPoint(b, g);
    if (b.goal === 'stake' && b.cow) {
      // (somewhere round its stake, a seeded spot: not on a plant)
      this.patch(b, first ? 0 : 1);
      b.x = b.tx;
      b.z = b.tz;
      b.yaw = (hash3(b.cow.id, 31, Math.floor(this.time / 30), 7105) - 0.5) * 6.2;
    } else {
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

  /** A fresh patch round its stake (as far as the rope lets its middle go), clear of his plants: into `tx, tz`. */
  private patch(b: Beast, salt: number): void {
    const st = b.cow ? (STAKES[b.cow.stake] ?? STAKES[0]) : STAKES[0];
    const seed = (b.cow?.id ?? b.i) * 13 + salt;
    for (let k = 0; k < 8; k++) {
      const a = hash3(seed, k, Math.floor(this.time / 7), 7107) * Math.PI * 2;
      const r = ROPE * (0.45 + 0.55 * Math.sqrt(hash3(seed, k, Math.floor(this.time / 7), 7108)));
      const x = st[0] + Math.sin(a) * r;
      const z = st[1] + Math.cos(a) * r;
      if (this.plantNear(x, z, b.size * 0.9) || this.otherNear(b, x, z)) continue;
      b.tx = x;
      b.tz = z;
      return;
    }
    b.tx = st[0] + 0.6;
    b.tz = st[1] + 0.6;
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
    if (this.builtAt(x, z, g)) return NaN;
    return g;
  }

  /** In a solid part of something he has built (its boxes, a margin round them). */
  private builtAt(x: number, z: number, y: number): boolean {
    for (const p of BUILT.list) {
      const dx = x - p.x;
      const dz = z - p.z;
      const spec = PIECES[p.id];
      const reach = Math.max(spec.w, spec.d) * 0.75 + 1;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (y > p.y + spec.h + 0.2) continue;
      // (into the piece's frame)
      const c = Math.cos(p.yaw);
      const s = Math.sin(p.yaw);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      for (const [sx, sz, w, d] of spec.solids) if (Math.abs(lx - sx) < w / 2 + 0.3 && Math.abs(lz - sz) < d / 2 + 0.3) return true;
    }
    return false;
  }

  // ── Ways ───────────────────────────────────────────────────────────────────

  /**
   * Find its way to its goal: the lane out of a pen first, a straight line if it walks (or hops) it, else the search
   * (one at a time; the others wait their turn); the pen's lane in last.
   */
  private plan(b: Beast): void {
    b.wn = b.wi = 0;
    b.at = false;
    const g = _pa;
    if (!this.goalPoint(b, g)) return;
    let gx = g.x;
    let gz = g.z;
    if (b.goal === 'stake' && b.cow) {
      this.patch(b, 2);
      gx = b.tx;
      gz = b.tz;
    }
    // (out of a pen: back through its gate first)
    if (b.pen >= 0 && b.goal !== 'pen') {
      const pen = BUILT.list[b.pen];
      if (pen && pen.id === 'pen') {
        const gate = PIECES.pen.pen!.gate;
        this.push(b, ...pieceToWorld(pen, gate[0], gate[1] - GATE_IN, _pw));
        this.push(b, ...pieceToWorld(pen, gate[0], gate[1] + GATE_OUT, _pw));
      }
      b.pen = -1;
    }
    // (into a pen: the way goes to its gate's outside, then the lane in)
    let tx = gx;
    let tz = gz;
    let lane = false;
    if (b.goal === 'pen' && b.pen >= 0) {
      const pen = BUILT.list[b.pen];
      const gate = PIECES.pen.pen!.gate;
      [tx, tz] = pieceToWorld(pen, gate[0], gate[1] + GATE_OUT, _pw);
      lane = true;
    }
    const sx = b.wn ? b.wx[b.wn - 1] : b.x;
    const sz = b.wn ? b.wz[b.wn - 1] : b.z;
    const sy = b.wn ? this.groundY(sx, sz, b.y) : b.y;
    const y = lineWalk(this.cowWorld, sx, sy, sz, tx, tz, true);
    if (!Number.isNaN(y)) {
      this.stats.straight++;
      this.push(b, tx, tz);
      if (lane) this.lane(b, gx, gz);
      b.doing = 'way';
      return;
    }
    // (the search: queued; the lane in is added when it has found the way)
    b.searching = true;
    b.doing = 'wait';
    b.tx = tx;
    b.tz = tz;
    if (!this.queue.includes(b) && this.searchFor !== b) this.queue.push(b);
  }

  private push(b: Beast, x: number, z: number): void {
    if (b.wn >= b.wx.length) return;
    b.wx[b.wn] = x;
    b.wz[b.wn] = z;
    b.wy[b.wn] = NaN;
    b.wn++;
  }

  /** The pen's lane: in through the gate, to its place. */
  private lane(b: Beast, gx: number, gz: number): void {
    const pen = BUILT.list[b.pen];
    if (!pen) return;
    const gate = PIECES.pen.pen!.gate;
    this.push(b, ...pieceToWorld(pen, gate[0], gate[1] - GATE_IN, _pw));
    this.push(b, gx, gz);
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
    if (st === 'found' || st === 'near') {
      const p = this.search.path;
      for (let k = 1; k < p.count; k++) {
        if (b.wn >= b.wx.length) break;
        b.wx[b.wn] = p.x[k];
        b.wy[b.wn] = p.y[k];
        b.wz[b.wn] = p.z[k];
        b.wn++;
      }
      if (b.goal === 'pen') {
        const g = _pa;
        if (this.goalPoint(b, g)) this.lane(b, g.x, g.z);
      } else if (st === 'found') this.push(b, b.tx, b.tz);
      b.doing = 'way';
      return;
    }
    // (no way: it stays where it is, at its goal's nearest, and tries again later; out of sight it is simply there)
    this.stats.failed++;
    b.doing = 'stand';
    b.until = this.time + 20;
    b.at = b.goal === 'stake';
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
      b.pen = -1;
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
      this.walk(b, dt, clock);
      return;
    }
    // There: what it does at its place.
    if (b.goal === 'pen') this.inPen(b, dt, clock);
    else if (b.goal === 'post') this.atPost(b, dt, clock);
    else this.atStake(b, dt, clock);
  }

  /** Along its way: walking, stopping for him in its way, up and down the land's steps (eased). */
  private walk(b: Beast, dt: number, clock: number): void {
    if (b.wi >= b.wn) {
      b.at = true;
      b.speed = 0;
      b.doing = b.goal === 'pen' ? 'stand' : 'graze';
      b.until = this.time + 2 + 4 * hash3(b.i, 19, Math.floor(this.time), 7111);
      if (b.goal === 'pen') {
        const g = _pa;
        if (this.goalPoint(b, g)) b.yaw = g.face;
      }
      if (b.leaving) this.drop(b);
      void clock;
      return;
    }
    const tx = b.wx[b.wi];
    const tz = b.wz[b.wi];
    const dx = tx - b.x;
    const dz = tz - b.z;
    const d = Math.hypot(dx, dz);
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
          const side = across > 0 ? -1 : 1;
          const r = 1.1 + 0.8 * b.size;
          const px = this.ex + fz * side * r + fx * 0.4;
          const pz = this.ez - fx * side * r + fz * 0.4;
          for (let k = b.wn; k > b.wi; k--) {
            b.wx[k] = b.wx[k - 1];
            b.wy[k] = b.wy[k - 1];
            b.wz[k] = b.wz[k - 1];
          }
          b.wx[b.wi] = px;
          b.wy[b.wi] = NaN;
          b.wz[b.wi] = pz;
          b.wn++;
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

  /** At its stake: grazing round it, ambling to a fresh patch, looking up, lowing; lying through the night with no pen; eating what he brought. */
  private atStake(b: Beast, dt: number, clock: number): void {
    const night = inHours(clock, LIE_HOURS);
    if (b.food) {
      this.eat(b, dt);
      return;
    }
    b.speed = 0;
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
      const dx = b.tx - b.x;
      const dz = b.tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        b.doing = 'graze';
        b.until = this.time + 9 + 16 * hash3(b.i, 23, Math.floor(this.time), 7112);
      } else {
        const st = Math.min(d, AMBLE * dt);
        b.x += (dx / d) * st;
        b.z += (dz / d) * st;
        const want = Math.atan2(dx, dz);
        let da = want - b.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        b.yaw += da * Math.min(1, dt * 2);
        b.y += (this.groundY(b.x, b.z, b.y) - b.y) * Math.min(1, dt * 5);
        b.speed = AMBLE;
        b.head = 1;
      }
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
      if (b.leaving) {
        this.drop(b);
        continue;
      }
      b.goal = this.goalNow(b, clock);
      b.pen = -1;
      if (b.goal === 'pen') this.penPlace(b);
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
        const walk = b.speed > 0.02 ? (b.speed > 0.5 ? 1 : 0.6) : 0;
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
    r.speed = b.speed;
    r.pitch = r.roll = 0;
    if (b.rest !== b.restWas) {
      b.restWas = b.rest;
      b.restAt = this.time;
    }
    const settled = this.time - b.restAt > 1.4 && b.speed < 0.01;
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
