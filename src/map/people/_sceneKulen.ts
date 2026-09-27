import { hash3 } from '../../voxel/random';
import { eventsNow } from '../events';
import { HAMMOCK_HUTS, HUT_FOOD, HUT_SEATS, hutHammock, onHut } from '../hamlet/_knHut';
import { KN_BUILT, kulenSite, roadStall, terracePath, wetAt, type KnHut, type KulenSite } from '../hamlet/_knSite';
import { COUNTER, GRILL, STOOLS } from '../hamlet/_knStall';
import { KULEN_PICNIC } from '../layout';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, POSE, type Look, type Pose } from './_personModel';
import { WalkMap } from '../roam/walkmap';
import { Ground, len, type Obstacle, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { KulenPilgrims } from './_sceneKulenPilgrims';
import { foodRig, hammockRig, kidLook, motoRig, picnicLook, stallGoodsRig } from './_sceneKulenKit';
import { Rig, type Things } from './_things';

/**
 * People on Phnom Kulen (scene `kulen`): the picnic place below the Kulen
 * stream's falls (the hamlet part's `_kulenPicnic.ts`: where its huts, stall
 * and pool are comes from `hamlet/_knSite.ts`) and the pilgrims on the
 * mountain road (`_sceneKulenPilgrims.ts`).
 *
 * At the picnic place, by day (`clock` ≈ 0.78‥0.2, each family on its own
 * hours; the last linger at dusk while the huts' lanterns are lit):
 *
 * - three families come by moto (it stands by the trail while they are
 *   there), walk in round the huts and climb onto their hut's deck: they sit
 *   on the mat round their food (rice, grilled chicken, fish, fruit) and
 *   look at the fall and at each other; now and then a father stands at the
 *   deck's edge to point it out; in two huts someone rocks in a hammock
 *   between the back posts (it swings: the people's things);
 * - their children play in the pool below the fall: one climbs the big rock
 *   and jumps in (a splash: `splashPlay`), the others wade and splash each
 *   other, laughing (`laugh`); they come out in the rain, in snow and at the day's end;
 * - a fruit seller walks round the huts where a family is, her basket on
 *   her head (`CARRY.head`), stopping to hold out her fruit (`give`,
 *   `vendorCall`); the cook works over the grill at the stall (`POSE.stir`,
 *   her hands at `FIT.wok` over the coals) and sells at the counter; a young
 *   man eats noodles on a low stool at the stall's table (`eat`); the smoke
 *   is the hamlet part's, the embers, fruit and drinks are laid out while it
 *   is open (the people's things);
 * - chatter from the huts (`market`, soft), the grill sizzling, motos
 *   coming and going.
 *
 * Everyone moves by a small plan (`Step`s: walk a path round the huts,
 * `terracePath`; hop up onto a deck, into the pool, onto the rock; then
 * stay: seated, in the hammock, in the water, on the rock). Far off (`Pace`)
 * they step less often, then hide; sitting still they are stepped every
 * third frame. Shots: `kulen=<s>` puts the child on the rock that many
 * seconds before his jump (3: he has just climbed up; 0.3: arms up).
 */

/** Families: which hut (in `KulenSite.huts` order), when they come and go (clock), their moto, who (a look, a seat or the hammock, a child who swims). */
interface FamilySpec {
  hut: number;
  arrive: number;
  leave: number;
  moto: number;
  who: { seed: number; kind: 'adult' | 'elder' | 'kid'; sex?: 'f' | 'm'; seat: number; swim?: 'jump' | 'wade'; hat?: 'palm' | 'krama' | 'none'; stands?: boolean }[];
}
const FAMILIES: FamilySpec[] = [
  {
    hut: 0,
    arrive: 0.78,
    leave: 0.2,
    moto: 0x2a2a2a,
    who: [
      { seed: 4101, kind: 'adult', sex: 'm', seat: 0, hat: 'none', stands: true },
      { seed: 4102, kind: 'adult', sex: 'f', seat: 1, hat: 'krama' },
      { seed: 4103, kind: 'elder', sex: 'f', seat: 2, hat: 'none' },
      { seed: 4104, kind: 'kid', seat: 4, swim: 'jump' },
    ],
  },
  {
    hut: 1,
    arrive: 0.81,
    leave: 0.25,
    moto: 0xc83a2e,
    who: [
      { seed: 4111, kind: 'adult', sex: 'f', seat: -1, hat: 'none' },
      { seed: 4112, kind: 'adult', sex: 'm', seat: 0, hat: 'krama', stands: true },
      { seed: 4113, kind: 'kid', seat: 3, swim: 'wade' },
    ],
  },
  {
    hut: 2,
    arrive: 0.84,
    leave: 0.29,
    moto: 0x2f5fb0,
    who: [
      { seed: 4121, kind: 'adult', sex: 'm', seat: -1, hat: 'none' },
      { seed: 4122, kind: 'adult', sex: 'f', seat: 1, hat: 'palm' },
      { seed: 4123, kind: 'kid', seat: 4, swim: 'wade' },
    ],
  },
];
/** The stall is open (clock), the fruit seller out on her rounds. */
const OPEN: readonly [number, number] = [0.77, 0.25];
/** Children swim in these hours (clock). */
const SWIM: readonly [number, number] = [0.86, 0.16];
/** Snow falling or lying past this (the Weather setting's dream): nobody goes in the water. */
const COLD = 0.3;
/** Walking pace on the terrace, a child's, the seller's (m/s). */
const WALK = 0.8;
const KID_RUN = 1.5;
const SELLER = 0.6;
/** Seconds the seller stays at each hut and at her stall. */
const SELL = 9;
const RESTOCK = 14;
/** Hammock cloths. */
const HAMMOCKS = [0x2f7ac8, 0xd84a3a, 0x3a9a5a];
/** The hammocks swing and the splashes show only this near the camera (m). */
const NEAR = 70;
/** Too dark for a picnic (`night`): anyone still there has gone home. */
const DARK = 0.62;

/** In a daily window from `a` to `b` (clock; it may wrap past 1). */
function inWindow(c: number, [a, b]: readonly [number, number]): boolean {
  return a <= b ? c >= a && c < b : c >= a || c < b;
}

/** Where someone stays once their plan is done. */
type Rest = 'away' | 'seat' | 'hammock' | 'water' | 'rock' | 'edge';

/** One step of a plan: a walk along a path, a hop (up a step, into the pool, a jump), or where to stay. */
type Step =
  | { kind: 'walk'; path: { x: number; z: number }[]; speed: number; delay: number }
  | { kind: 'hop'; x: number; y: number; z: number; peak: number; dur: number; pose: Pose; splash: number }
  | { kind: 'rest'; rest: Rest };

interface Picnicker {
  a: Actor;
  fam: Family;
  seat: number;
  swim: 'jump' | 'wade' | null;
  stands: boolean;
  rest: Rest;
  plan: Step[];
  /** In the step now: how far along a walk (leg) or a hop (s), where a hop began. */
  leg: number;
  t: number;
  from: { x: number; y: number; z: number; yaw: number };
  /** Seconds left of what they do while resting (at the deck's edge, on the rock, in one spot in the water). */
  timer: number;
  /** A wading spot (`KulenSite.wade`). */
  spot: number;
  /** Their seat on the deck and where they stand at its front edge (map m, facing), worked out once. */
  seatAt: Spot;
  edgeAt: Spot;
  /** Sitting still, they are stepped every third frame (the poses and looks ease on the GPU): frames counted, time summed. */
  tick: number;
  acc: number;
}

/** A place on the map and the way to face there. */
interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Family {
  spec: FamilySpec;
  hut: KnHut;
  /** On the ground behind the hut, where they step up onto the deck. */
  back: { x: number; z: number };
  /** By their moto (where they arrive and leave from). */
  gate: { x: number; z: number };
  members: Picnicker[];
  /** Where their food is laid on the mat. */
  foodAt: Spot;
  food: Rig | null;
  moto: Rig | null;
  motoAt: { x: number; y: number; z: number; yaw: number } | null;
  hammock: { rig: Rig; swing: number; x: number; y: number; z: number; yaw: number; sag: number; phase: number; who: Picnicker | null } | null;
  state: 'away' | 'coming' | 'there' | 'going';
}

export class KulenLife implements PeopleScene {
  readonly name = 'kulen';
  readonly actors: Actor[] = [];
  private readonly picnic: Picnic | null;
  private readonly pilgrims: KulenPilgrims;

  constructor(env: PeopleEnv) {
    const field = env.ground.field;
    const site = kulenSite(field);
    this.picnic = site.huts.length >= 3 ? new Picnic(env, site, this.actors) : null;
    this.pilgrims = new KulenPilgrims(env, roadStall(field), this.actors);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    this.picnic?.update(dt, now, f, ex);
    this.pilgrims.update(dt, now, f, ex);
  }

  report(traffic: Traffic): void {
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
  }
}

/** The picnic place's people (see the file's comment). */
class Picnic {
  private readonly families: Family[] = [];
  private readonly seller: Actor | null = null;
  private readonly cook: Actor | null = null;
  private readonly eater: Actor | null = null;
  private readonly goods: Rig | null = null;
  private readonly pace = new Pace(130, 420);
  private readonly splash: Splash | null;
  private shown = false;
  /** The seller's round: which point of it she is at or going to, how long she stays, her path there. */
  private sellLeg = 0;
  private sellWait = 0;
  private sellPath: { x: number; z: number }[] = [];
  private sellStep = 0;
  /** When to make the next sounds (s, the people's clock). */
  private chatAt = 0;
  private sizzleAt = 0;
  private laughAt = 0;
  private readonly mid: { x: number; z: number };
  /** Where the children go into the water and come out: the terrace's edge nearest their rock, and the water by it. */
  private readonly bank: { x: number; z: number };
  private readonly bankWater: { x: number; z: number };
  /** The land there (m). */
  private readonly bankY: number;
  /** Where the picnickers stand: the picnic place's own walk map over the land. */
  private readonly ground: Ground;
  private readonly look = { x: 0, y: 0, z: 0 };
  /** The camera is near (`NEAR`): the hammocks swing, the splashes show. */
  private near = false;
  /** The stall's places (map m): the cook at the grill and at the counter, the fire, the eater's feet. */
  private readonly at: { grill: { x: number; z: number }; counter: { x: number; z: number }; fire: { x: number; z: number }; eater: { x: number; z: number } };

  constructor(
    private readonly env: PeopleEnv,
    private readonly site: KulenSite,
    actors: Actor[],
  ) {
    const { crowd, things } = env;
    const field = env.ground.field;
    this.mid = { x: KULEN_PICNIC.x, z: KULEN_PICNIC.z };
    // The children go into the water from the land nearest their rock (`KulenSite.bank`).
    this.bank = site.bank;
    this.bankWater = site.bankWater;
    this.bankY = field.heightAt(site.bank.x, site.bank.z);
    // Its floors (the steps down to the beach, the decks, the rocks) over the land: its own walk map.
    const built = KN_BUILT.object;
    this.ground = built ? new Ground(field, new WalkMap(field, [{ name: 'hamlet', object: built }])) : env.ground;
    const thingsRoom = (n: number) => things.used + n <= things.capacity;
    const actor = (look: Look) => {
      const a = new Actor(crowd, look, this.ground);
      actors.push(a);
      return a;
    };
    for (const [k, spec] of FAMILIES.entries()) {
      const hut = site.huts[spec.hut];
      // (room in the crowd: the others' scenes come first; a family fewer if need be)
      if (!hut || crowd.count + spec.who.length + 2 > crowd.capacity) continue;
      const m = site.motos[k];
      const motoAt = m ? { x: m.x, y: field.heightAt(m.x, m.z), z: m.z, yaw: m.yaw } : null;
      const fam: Family = {
        spec,
        hut,
        back: onHut(hut, 0, -hut.d / 2 - 0.95),
        gate: motoAt ? { x: m.x + Math.sin(m.yaw + Math.PI / 2) * 0.9, z: m.z + Math.cos(m.yaw + Math.PI / 2) * 0.9 } : site.entry,
        members: [],
        foodAt: onHut(hut, HUT_FOOD[0], HUT_FOOD[1]),
        food: null,
        moto: null,
        motoAt,
        hammock: null,
        state: 'away',
      };
      for (const w of spec.who) {
        const look = w.kind === 'kid' ? kidLook(w.seed) : picnicLook(w.seed, { sex: w.sex, hat: w.hat, age: w.kind === 'elder' ? 'old' : undefined });
        const [lx, lz, ly] = HUT_SEATS[Math.max(0, w.seat)];
        fam.members.push({
          a: actor(look),
          fam,
          seat: w.seat,
          swim: w.swim ?? null,
          stands: !!w.stands,
          rest: 'away',
          plan: [],
          leg: 0,
          t: 0,
          from: { x: 0, y: 0, z: 0, yaw: 0 },
          timer: 0,
          spot: k,
          seatAt: onHut(hut, lx, lz, ly),
          edgeAt: edgeSpot(hut, w.seat === 0 ? -0.4 : 0.4, site.plunge),
          tick: w.seed % 3,
          acc: 0,
        });
      }
      if (thingsRoom(40)) fam.food = new Rig(things, foodRig(spec.hut + 7));
      if (motoAt && thingsRoom(20)) fam.moto = new Rig(things, motoRig(spec.moto));
      if (HAMMOCK_HUTS.includes(spec.hut) && fam.members.some((p) => p.seat === -1) && thingsRoom(30)) {
        const hm = hutHammock(hut);
        const dx = hm.b[0] - hm.a[0];
        const dz = hm.b[2] - hm.a[2];
        const l = Math.hypot(dx, dz);
        const { def, swing } = hammockRig(l / 2, hm.sag, HAMMOCKS[k % HAMMOCKS.length], k);
        fam.hammock = { rig: new Rig(things, def), swing, x: (hm.a[0] + hm.b[0]) / 2, y: hm.a[1], z: (hm.a[2] + hm.b[2]) / 2, yaw: Math.atan2(-dz / l, dx / l), sag: hm.sag, phase: k * 1.7, who: fam.members.find((p) => p.seat === -1) ?? null };
      }
      this.families.push(fam);
    }
    if (crowd.count + 3 <= crowd.capacity) {
      // The fruit seller (her basket on a coiled krama on her head), the cook, a young man eating at the stall's table.
      this.seller = actor(dress('vendor', 4131, { sex: 'f', hat: 'krama', carry: CARRY.head, goods: 'fruit' }));
      this.cook = actor(dress('vendor', 4132, { sex: 'f', hat: 'none', goods: 'sweets' }));
      this.eater = actor(picnicLook(4133, { sex: 'm', hat: 'none', props: [FEAT.smallBowl] }));
    }
    if (thingsRoom(60)) {
      this.goods = new Rig(things, stallGoodsRig(COUNTER, GRILL));
      this.goods.place(site.stall.x, site.ground, site.stall.z, site.stall.yaw);
    }
    this.splash = thingsRoom(Splash.N) ? new Splash(things) : null;
    // The stall's places (the cook's hands at `FIT.wok` ahead over the coals; the eater on his stool: the `eat` pose, as
    // `stool`, sits the hips over the feet's spot, the stool under them, his feet out under the table's edge).
    const st = site.stall;
    const cs = Math.cos(st.yaw);
    const sn = Math.sin(st.yaw);
    const stallAt = (lx: number, lz: number) => ({ x: st.x + lx * cs + lz * sn, z: st.z - lx * sn + lz * cs });
    const cookScale = this.cook ? this.cook.crowd.scale(this.cook.i) : 1.3;
    const stool = stallAt(STOOLS[0][0], STOOLS[0][1]);
    this.at = {
      grill: stallAt(GRILL.x - FIT.wok.z * cookScale, GRILL.z),
      counter: stallAt(COUNTER.x - 0.6, COUNTER.z - 0.75),
      fire: stallAt(GRILL.x, GRILL.z),
      eater: stool,
    };
    // (the walks they will take, found now rather than on the frame they set off: `terracePath` remembers them)
    for (const fam of this.families) {
      terracePath(site, field, fam.gate, fam.back);
      terracePath(site, field, fam.back, fam.gate);
      terracePath(site, field, fam.back, this.bank);
      terracePath(site, field, this.bank, fam.back);
      terracePath(site, field, this.bank, fam.gate);
    }
    for (const a of site.round) for (const b of site.round) if (a !== b) terracePath(site, field, a, b);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, this.mid.x, this.mid.z));
    if (step < 0) return this.hideAll();
    if (step === 0 && this.shown) return;
    dt = step;
    const first = !this.shown;
    this.shown = true;
    const ev = eventsNow(f);
    const wet = ev.umbrellas > 0.5 || ev.shelter > 0.3;
    const hear = len(f.listener.x - this.mid.x, f.listener.z - this.mid.z);
    let there = 0;
    const near = viewDist(f, this.mid.x, this.mid.z) < NEAR;
    this.near = near;
    for (const fam of this.families) {
      this.family(fam, dt, now, f, first, wet, hear, near);
      if (fam.state === 'there') there++;
    }
    this.stall(dt, now, f, first, ex);
    this.splash?.update(now);
    // The families' chatter (never in shots: `f.dt` is 0 there).
    if (f.dt > 0 && there > 0 && hear < 70 && now > this.chatAt) {
      this.chatAt = now + 5 + 4 * hash3(Math.floor(now), 3, 1, 131);
      f.calls.push({ kind: 'market', x: this.mid.x, y: this.site.ground + 1.5, z: this.mid.z, gain: 0.1 + 0.05 * there });
    }
  }

  // ── A family: coming, their day on the deck, going home ─────────────────────

  private family(fam: Family, dt: number, now: number, f: MapFrame, first: boolean, wet: boolean, hear: number, near: boolean): void {
    const c = f.clock;
    const want = inWindow(c, [fam.spec.arrive, fam.spec.leave]) && f.night < DARK;
    const swimming = !wet && inWindow(c, SWIM) && f.night < 0.4 && f.weather.snow < COLD && f.weather.snowCover < COLD;
    if (first) {
      // (a still, or coming into view: as they would be now)
      fam.state = want ? 'there' : 'away';
      for (const p of fam.members) {
        if (want) this.placeNow(p, now, swimming);
        else this.hide(p);
      }
    }
    if (fam.state === 'away' && want) {
      fam.state = 'coming';
      const path = terracePath(this.site, this.env.ground.field, fam.gate, fam.back);
      fam.members.forEach((p, k) => {
        p.a.warp(fam.gate.x, this.floorAt(fam.gate.x, fam.gate.z), fam.gate.z, 0);
        // (one after another along the path)
        this.plan(p, [{ kind: 'walk', path, speed: WALK, delay: k * 1.4 }, ...this.climbOn(p)]);
      });
      this.motoSound(fam, f, hear);
    } else if ((fam.state === 'there' || fam.state === 'coming') && !want) {
      fam.state = 'going';
      for (const p of fam.members) this.plan(p, this.goHome(p));
    }
    // The moto by the trail, the food on the mat.
    if (fam.moto && fam.motoAt) {
      if (fam.state === 'away') fam.moto.hide();
      else {
        const m = fam.motoAt;
        fam.moto.place(m.x, m.y, m.z, m.yaw);
        fam.moto.write();
      }
    }
    if (fam.food) {
      if (fam.state === 'there' || fam.state === 'going') {
        fam.food.place(fam.foodAt.x, fam.hut.floor + 0.02, fam.foodAt.z, fam.hut.yaw);
        fam.food.write();
      } else fam.food.hide();
    }
    let settled = true;
    let gone = true;
    for (const p of fam.members) {
      this.member(p, dt, now, f, fam.state === 'there' && swimming, wet);
      if (p.plan.length) settled = false;
      if (p.rest !== 'away' || p.plan.length) gone = false;
    }
    if (fam.state === 'coming' && settled) fam.state = 'there';
    if (fam.state === 'going' && gone) {
      fam.state = 'away';
      this.motoSound(fam, f, hear);
    }
    // The hammock swings (more with someone in it, who rides its lowest point).
    const h = fam.hammock;
    if (h) {
      if (fam.state === 'away') h.rig.hide();
      else {
        const who = h.who && h.who.rest === 'hammock' && !h.who.plan.length ? h.who : null;
        // (it swings only where it can be seen to: near the camera; farther it hangs still)
        const th = near ? (who ? 0.16 : 0.03) * Math.sin(now * 1.25 + h.phase) : 0;
        h.rig.place(h.x, h.y, h.z, h.yaw);
        h.rig.turn(h.swing, th);
        h.rig.write();
        const wdt = who ? slow(who, dt) : 0;
        if (who && wdt) {
          const out = -h.sag * Math.sin(th);
          who.a.ride(h.x + Math.sin(h.yaw) * out, h.y - h.sag * Math.cos(th) + 0.02, h.z + Math.cos(h.yaw) * out, h.yaw + Math.PI / 2);
          who.a.pose(POSE.hammock, now);
          who.a.step(wdt, now);
        }
      }
    }
  }

  private motoSound(fam: Family, f: MapFrame, hear: number): void {
    const m = fam.motoAt;
    if (f.dt > 0 && hear < 120 && m) f.calls.push({ kind: 'moto', x: m.x, y: m.y + 0.6, z: m.z, gain: 0.5 });
  }

  /** Up onto the deck from behind the hut: to their seat or into the hammock. */
  private climbOn(p: Picnicker): Step[] {
    const hut = p.fam.hut;
    const h = p.fam.hammock;
    if (p.seat === -1 && h) return [{ kind: 'hop', x: h.x, y: h.y - h.sag + 0.02, z: h.z, peak: 0.25, dur: 0.9, pose: POSE.stand, splash: 0 }, { kind: 'rest', rest: 'hammock' }];
    const s = p.seatAt;
    void hut;
    return [{ kind: 'hop', x: s.x, y: s.y, z: s.z, peak: 0.25, dur: 0.7, pose: POSE.stand, splash: 0 }, { kind: 'rest', rest: 'seat' }];
  }

  /** Down off the deck (or up out of the pool) and along the path to the moto. */
  private goHome(p: Picnicker): Step[] {
    const fam = p.fam;
    const field = this.env.ground.field;
    if (p.rest === 'away' && !p.plan.length) return [];
    if (p.rest === 'water' || p.rest === 'rock') {
      const w = this.bankWater;
      const out: Step[] = [];
      if (p.rest === 'rock') out.push({ kind: 'hop', x: w.x, y: field.heightAt(w.x, w.z), z: w.z, peak: 0.4, dur: 0.9, pose: POSE.stand, splash: 0.5 });
      else out.push({ kind: 'walk', path: [w], speed: 0.7, delay: 0 });
      return [...out, { kind: 'hop', x: this.bank.x, y: this.bankY, z: this.bank.z, peak: 0.3, dur: 1.0, pose: POSE.climb, splash: 0 }, { kind: 'walk', path: terracePath(this.site, field, this.bank, fam.gate), speed: WALK, delay: 0 }, { kind: 'rest', rest: 'away' }];
    }
    // (still on the way in: straight back along the path)
    const from = p.rest === 'seat' || p.rest === 'hammock' || p.rest === 'edge' ? fam.back : { x: p.a.x, z: p.a.z };
    const down: Step[] = p.rest === 'seat' || p.rest === 'hammock' || p.rest === 'edge' ? [{ kind: 'hop', x: fam.back.x, y: fam.hut.ground, z: fam.back.z, peak: 0.2, dur: 0.6, pose: POSE.stand, splash: 0 }] : [];
    return [...down, { kind: 'walk', path: terracePath(this.site, field, from, fam.gate), speed: WALK, delay: 0.8 * fam.members.indexOf(p) }, { kind: 'rest', rest: 'away' }];
  }

  /** A child off the deck and down to the water. */
  private toWater(p: Picnicker): Step[] {
    const fam = p.fam;
    const field = this.env.ground.field;
    const w = this.bankWater;
    return [
      { kind: 'hop', x: fam.back.x, y: fam.hut.ground, z: fam.back.z, peak: 0.2, dur: 0.6, pose: POSE.stand, splash: 0 },
      { kind: 'walk', path: terracePath(this.site, field, fam.back, this.bank), speed: KID_RUN, delay: 0 },
      { kind: 'hop', x: w.x, y: field.heightAt(w.x, w.z), z: w.z, peak: 0.5, dur: 0.8, pose: POSE.cheer, splash: 0.6 },
      { kind: 'rest', rest: 'water' },
    ];
  }

  /** A child out of the water and back to the deck (rain, or the swim is over). */
  private outOfWater(p: Picnicker): Step[] {
    const fam = p.fam;
    const field = this.env.ground.field;
    const w = this.bankWater;
    const first: Step[] =
      p.rest === 'rock'
        ? [{ kind: 'hop', x: w.x, y: field.heightAt(w.x, w.z), z: w.z, peak: 0.4, dur: 0.9, pose: POSE.stand, splash: 0.5 }]
        : [{ kind: 'walk', path: [w], speed: 0.7, delay: 0 }];
    return [...first, { kind: 'hop', x: this.bank.x, y: this.bankY, z: this.bank.z, peak: 0.3, dur: 1.0, pose: POSE.climb, splash: 0 }, { kind: 'walk', path: terracePath(this.site, field, this.bank, fam.back), speed: KID_RUN, delay: 0 }, ...this.climbOn(p)];
  }

  private plan(p: Picnicker, steps: Step[]): void {
    p.plan = steps;
    p.leg = 0;
    p.t = 0;
    p.from = { x: p.a.x, y: p.a.y, z: p.a.z, yaw: p.a.yaw };
  }

  /** Someone of a family, one step: their plan, else where they stay. */
  private member(p: Picnicker, dt: number, now: number, f: MapFrame, swimming: boolean, wet: boolean): void {
    const a = p.a;
    if (p.plan.length) return this.follow(p, dt, now, f);
    const site = this.site;
    const field = this.env.ground.field;
    const hut = p.fam.hut;
    switch (p.rest) {
      case 'away':
        if (a.shown) a.hide();
        return;
      case 'seat': {
        dt = slow(p, dt);
        if (!dt) return;
        const s = p.seatAt;
        a.ride(s.x, s.y, s.z, s.yaw);
        a.pose(POSE.sit, now);
        // (at the others, at the fall, or just ahead)
        const r = hash3(Math.floor(now / 7 + a.i * 0.37), a.i, 2, 133);
        if (r < 0.4) a.lookAt(this.point(hut.x, hut.floor + 1.2, hut.z), now + 1);
        else if (r < 0.75) a.lookAt(this.point(site.plunge.x, site.level + 3, site.plunge.z), now + 1);
        else a.lookAt(null);
        a.step(dt, now);
        // The children go to play; a father gets up now and then to look at the fall from the deck's edge.
        if (p.swim && swimming) this.plan(p, this.toWater(p));
        else if (p.stands && !wet && hash3(Math.floor(now / 40), a.i, 4, 134) < 0.3 && now % 40 < dt * 1.5) {
          p.rest = 'edge';
          p.timer = 9;
        }
        return;
      }
      case 'edge': {
        // Standing at the front of the deck, looking at the fall, pointing it out.
        const s = p.edgeAt;
        a.ride(s.x, s.y, s.z, s.yaw);
        a.pose(p.timer > 5 && p.timer < 7 ? POSE.point : POSE.look, now);
        a.lookAt(this.point(site.plunge.x, site.level + 4, site.plunge.z), now + 1);
        a.step(dt, now);
        p.timer -= dt;
        if (p.timer <= 0) p.rest = 'seat';
        return;
      }
      case 'hammock':
        // (the family's hammock rides them: `family`)
        if (!p.fam.hammock) p.rest = 'seat';
        return;
      case 'water': {
        if (!swimming) return this.plan(p, p.fam.state === 'going' ? this.goHome(p) : this.outOfWater(p));
        if (p.swim === 'jump') {
          // Round to the rock's foot on this side, and up it.
          const rk = site.rock;
          const dx = a.x - rk.x;
          const dz = a.z - rk.z;
          const d = len(dx, dz) || 1;
          const foot = { x: rk.x + (dx / d) * (rk.size / 2 + 0.35), z: rk.z + (dz / d) * (rk.size / 2 + 0.35) };
          const up = { x: rk.x + (dx / d) * 0.25, z: rk.z + (dz / d) * 0.25 };
          return this.plan(p, [
            { kind: 'walk', path: [foot], speed: 0.75, delay: 0.5 },
            { kind: 'hop', x: up.x, y: rk.top, z: up.z, peak: 0.25, dur: 1.3, pose: POSE.climb, splash: 0 },
            { kind: 'rest', rest: 'rock' },
          ]);
        }
        // Wading: from spot to spot, stopping to splash (arms pumping) and laugh.
        const w = this.wadeAt(p);
        if (a.dist(w.x, w.z) > 0.4) {
          a.goTo(w.x, w.z, 0.6);
          a.face(null);
          a.pose(POSE.stand, now);
        } else {
          a.stop(a.yawTo(site.rock.x, site.rock.z));
          p.timer -= dt;
          a.pose(Math.sin(now * 0.9 + a.i) > -0.2 ? POSE.cheer : POSE.wave, now);
          if (p.timer <= 0) {
            p.timer = 6 + 6 * hash3(Math.floor(now), a.i, 5, 135);
            p.spot = (p.spot + 1 + Math.floor(hash3(Math.floor(now), a.i, 6, 136) * Math.max(1, site.wade.length - 1))) % site.wade.length;
            if (this.near) this.splash?.start(a.x, site.level, a.z, now, 0.55);
            this.sound(f, 'splashPlay', a.x, site.level, a.z, 0.45);
          }
        }
        a.step(dt, now);
        if (f.dt > 0 && now > this.laughAt) {
          this.laughAt = now + 9 + 9 * hash3(Math.floor(now), 7, 7, 137);
          this.sound(f, 'laugh', a.x, a.y + 1.2, a.z, 0.6);
        }
        return;
      }
      case 'rock': {
        // On the rock: a look down at the water, arms up, and in.
        const rk = site.rock;
        const land = this.landing(p);
        a.ride(a.x, rk.top, a.z, Math.atan2(land.x - a.x, land.z - a.z));
        p.timer -= dt;
        a.pose(p.timer < 1.1 ? POSE.cheer : POSE.stand, now);
        a.lookAt(this.point(land.x, site.level, land.z), now + 1);
        a.step(dt, now);
        if (p.timer <= 0 || !swimming) {
          const jump = swimming ? 1.1 : 0.4;
          this.plan(p, [{ kind: 'hop', x: land.x, y: field.heightAt(land.x, land.z), z: land.z, peak: jump, dur: swimming ? 0.95 : 0.8, pose: POSE.cheer, splash: swimming ? 1 : 0.5 }, { kind: 'rest', rest: 'water' }]);
        }
        return;
      }
    }
  }

  /** The step of a plan now: walk on, hop on, or rest (then the next step). */
  private follow(p: Picnicker, dt: number, now: number, f: MapFrame): void {
    const a = p.a;
    const s = p.plan[0];
    if (s.kind === 'rest') {
      p.rest = s.rest;
      p.plan.shift();
      if (s.rest === 'rock') p.timer = this.env.params.has('kulen') ? 3 : 2.2 + 2 * hash3(Math.floor(now), a.i, 8, 138);
      if (s.rest === 'water') p.timer = 2;
      if (s.rest === 'away') a.hide();
      else a.riding = s.rest !== 'water';
      return;
    }
    if (s.kind === 'walk') {
      if (s.delay > 0) {
        // (waiting their turn: not out yet when arriving, standing when leaving)
        s.delay -= dt;
        if (p.fam.state === 'coming' && a.shown) a.hide();
        if (p.fam.state !== 'coming') a.step(dt, now);
        return;
      }
      if (!a.shown) a.show();
      a.riding = false;
      const goal = s.path[Math.min(p.leg, s.path.length - 1)];
      a.goTo(goal.x, goal.z, s.speed);
      a.face(null);
      a.pose(POSE.stand, now);
      a.lookAt(null);
      a.step(dt, now);
      if (a.dist(goal.x, goal.z) < 0.3) {
        if (p.leg < s.path.length - 1) p.leg++;
        else this.next(p);
      }
      return;
    }
    // A hop: along a line from where it began, up over it by `peak` in the middle.
    if (p.t === 0) p.from = { x: a.x, y: a.y, z: a.z, yaw: Math.abs(s.x - a.x) + Math.abs(s.z - a.z) > 0.05 ? Math.atan2(s.x - a.x, s.z - a.z) : a.yaw };
    if (!a.shown) a.show();
    p.t = Math.min(s.dur, p.t + dt);
    const u = p.t / s.dur;
    const k = u * u * (3 - 2 * u);
    const o = p.from;
    a.ride(o.x + (s.x - o.x) * k, o.y + (s.y - o.y) * u + s.peak * 4 * u * (1 - u), o.z + (s.z - o.z) * k, o.yaw);
    a.pose(s.pose, now);
    a.step(dt, now);
    if (u >= 1) {
      if (s.splash > 0) {
        if (this.near) this.splash?.start(s.x, this.site.level, s.z, now, s.splash);
        this.sound(f, 'splashPlay', s.x, this.site.level, s.z, 0.35 + 0.5 * s.splash);
      }
      this.next(p);
    }
  }

  private next(p: Picnicker): void {
    p.plan.shift();
    p.leg = 0;
    p.t = 0;
  }

  /** Where a wading child goes next: their wading spot, each child a little to their own side of it (two may share one). */
  private wadeAt(p: Picnicker): { x: number; z: number } {
    const w = this.site.wade[p.spot % this.site.wade.length];
    const a = (p.fam.spec.hut * 2.4 + p.spot) % (Math.PI * 2);
    const q = this.wadeBuf;
    q.x = w.x + Math.sin(a) * 0.6;
    q.z = w.z + Math.cos(a) * 0.6;
    // (still in the water: else the spot itself)
    if (!wetAt(this.env.ground.field, q.x, q.z)) [q.x, q.z] = [w.x, w.z];
    return q;
  }
  private readonly wadeBuf = { x: 0, z: 0 };

  /** Where the jumper lands: the wading spot nearest the rock at least 2 m out, clear of the others. */
  private landing(p: Picnicker): { x: number; z: number } {
    const site = this.site;
    let best = site.wade[0];
    let bd = Infinity;
    for (const q of site.wade) {
      const d = len(q.x - site.rock.x, q.z - site.rock.z);
      if (d < 2 || d >= bd) continue;
      let busy = false;
      for (const fam of this.families) for (const o of fam.members) if (o !== p && o.rest === 'water' && len(o.a.x - q.x, o.a.z - q.z) < 1.2) busy = true;
      if (busy) continue;
      bd = d;
      best = q;
    }
    return best;
  }

  /** Straight to where they would be now (a still, or coming into view): on the deck, in the hammock, in the pool, on the rock. */
  private placeNow(p: Picnicker, now: number, swimming: boolean): void {
    const a = p.a;
    const site = this.site;
    const field = this.env.ground.field;
    p.plan = [];
    a.show();
    a.carry(0, now);
    if (p.seat === -1 && p.fam.hammock) {
      p.rest = 'hammock';
      const h = p.fam.hammock;
      a.ride(h.x, h.y - h.sag + 0.02, h.z, h.yaw + Math.PI / 2);
      a.pose(POSE.hammock, now);
    } else if (swimming && p.swim === 'wade') {
      const w = this.wadeAt(p);
      a.warp(w.x, field.heightAt(w.x, w.z), w.z, a.yawTo(site.rock.x, site.rock.z));
      p.rest = 'water';
      p.timer = 2 + 3 * hash3(a.i, 1, 2, 139);
    } else if (swimming && p.swim === 'jump') {
      // (on the rock, about to jump: `kulen=<s>` sets how soon)
      const rk = site.rock;
      const land = this.landing(p);
      const d = Math.hypot(land.x - rk.x, land.z - rk.z) || 1;
      a.ride(rk.x + ((land.x - rk.x) / d) * 0.3, rk.top, rk.z + ((land.z - rk.z) / d) * 0.3, Math.atan2(land.x - rk.x, land.z - rk.z));
      p.rest = 'rock';
      const q = this.env.params.get('kulen');
      p.timer = q !== null ? Math.max(0.05, Number(q) || 0) : 1.5 + 2 * hash3(a.i, 3, 4, 140);
    } else {
      p.rest = 'seat';
      const s = p.seatAt;
      a.ride(s.x, s.y, s.z, s.yaw);
      a.pose(POSE.sit, now);
    }
  }

  private hide(p: Picnicker): void {
    p.rest = 'away';
    p.plan = [];
    if (p.a.shown) p.a.hide();
  }

  // ── The stall: the cook at the grill, the seller's round ─────────────────────

  private stall(dt: number, now: number, f: MapFrame, first: boolean, ex: Obstacle | null): void {
    const open = inWindow(f.clock, OPEN) && f.night < DARK;
    const site = this.site;
    const st = site.stall;
    const at = this.at;
    if (this.goods) {
      if (open) this.goods.write();
      else this.goods.hide();
    }
    const cook = this.cook;
    if (cook) {
      if (!open) {
        if (cook.shown) cook.hide();
      } else {
        // At the grill turning the chicken over the coals (her hands at `FIT.wok` ahead); now and then at the counter, selling.
        const selling = Math.sin(now * 0.07 + 1.3) > 0.6;
        const p = selling ? at.counter : at.grill;
        if (!cook.shown || first) {
          cook.warp(p.x, site.ground, p.z, st.yaw);
          cook.show();
        }
        cook.goTo(p.x, p.z, 0.5);
        cook.face(selling ? st.yaw : st.yaw + Math.PI / 2);
        cook.pose(selling ? (Math.sin(now * 0.5) > 0.3 ? POSE.give : POSE.stand) : POSE.stir, now);
        cook.lookAt(selling && ex && cook.dist(ex.x, ex.z) < 6 ? this.point(ex.x, ex.y + 2, ex.z) : null, now + 1);
        cook.step(dt, now);
        if (f.dt > 0 && now > this.sizzleAt) {
          this.sizzleAt = now + 6 + 5 * hash3(Math.floor(now), 2, 9, 141);
          const g = at.fire;
          if (len(f.listener.x - g.x, f.listener.z - g.z) < 40) f.calls.push({ kind: 'sizzle', x: g.x, y: site.ground + 1, z: g.z, gain: 0.35 });
        }
      }
    }
    const e = this.eater;
    if (e) {
      if (!open || f.night > 0.3) {
        if (e.shown) e.hide();
      } else {
        // On a low stool at the stall's table, eating a bowl of noodles. (Held at the stool on the terrace, `ride`: the walk
        // map would stand him on the stool's top, or on the table's by its edge.)
        const face = st.yaw + Math.PI / 2;
        const o = at.eater;
        e.ride(o.x, site.ground, o.z, face);
        if (!e.shown) e.show();
        e.pose(POSE.eat, now);
        e.step(dt, now);
      }
    }
    const s = this.seller;
    if (!s) return;
    const round = site.round;
    if (!open || round.length < 2) {
      if (s.shown) s.hide();
      this.sellPath = [];
      return;
    }
    if (!s.shown || first || !this.sellPath.length) {
      // (at her stall, or somewhere on her round in a still)
      const k = first ? Math.floor(hash3(Math.floor(now / 60), 1, 1, 142) * round.length) % round.length : 0;
      this.sellLeg = k;
      const p = round[k];
      s.warp(p.x, this.floorAt(p.x, p.z), p.z, 0);
      s.show();
      s.carry(1, now);
      this.sellWait = first ? 3 + 5 * hash3(Math.floor(now), 2, 2, 143) : RESTOCK;
      this.sellPath = [p];
      this.sellStep = 0;
    }
    const here = round[this.sellLeg];
    if (this.sellWait > 0) {
      this.sellWait -= dt;
      s.stop();
      if (here.hut >= 0) {
        // Selling at a hut: facing its deck, the basket down to show the fruit.
        const h = site.huts[here.hut];
        s.face(s.yawTo(h.x, h.z));
        s.pose(this.sellWait > SELL * 0.3 ? POSE.give : POSE.stand, now);
        s.lookAt(this.point(h.x, h.floor + 1, h.z), now + 1);
      } else {
        s.face(st.yaw + Math.PI);
        s.pose(POSE.stand, now);
      }
      s.step(dt, now);
      if (this.sellWait <= 0) {
        // On to the next hut where a family is (or back to the stall).
        let next = (this.sellLeg + 1) % round.length;
        for (let n = 0; n < round.length; n++) {
          const r = round[next];
          if (r.hut < 0 || this.families.some((fam) => fam.hut === site.huts[r.hut] && fam.state === 'there')) break;
          next = (next + 1) % round.length;
        }
        this.sellPath = terracePath(site, this.env.ground.field, round[this.sellLeg], round[next]);
        this.sellStep = 1;
        this.sellLeg = next;
        if (f.dt > 0 && len(f.listener.x - s.x, f.listener.z - s.z) < 45) f.calls.push({ kind: 'vendorCall', x: s.x, y: s.y + 2, z: s.z, gain: 0.45 });
      }
      return;
    }
    const goal = this.sellPath[Math.min(this.sellStep, this.sellPath.length - 1)];
    s.goTo(goal.x, goal.z, SELLER);
    s.face(null);
    s.pose(POSE.stand, now);
    s.lookAt(null);
    s.step(dt, now);
    if (s.dist(goal.x, goal.z) < 0.3) {
      if (this.sellStep < this.sellPath.length - 1) this.sellStep++;
      else this.sellWait = round[this.sellLeg].hut < 0 ? RESTOCK : SELL;
    }
  }

  /** The floor at (x, z) for someone arriving there (m): the picnic place's blocks (the steps, a deck) or the land. */
  private floorAt(x: number, z: number): number {
    const g = this.ground.at(x, z, this.env.ground.field.heightAt(x, z) + 1);
    return Number.isFinite(g) ? g : this.env.ground.field.heightAt(x, z);
  }

  /** A point to look at (a shared buffer: `lookAt` copies it). */
  private point(x: number, y: number, z: number): { x: number; y: number; z: number } {
    const q = this.look;
    q.x = x;
    q.y = y;
    q.z = z;
    return q;
  }

  private sound(f: MapFrame, kind: 'splashPlay' | 'laugh', x: number, y: number, z: number, gain: number): void {
    if (f.dt > 0 && len(f.listener.x - x, f.listener.z - z) < 60) f.calls.push({ kind, x, y, z, gain });
  }

  private hideAll(): void {
    if (!this.shown) return;
    this.shown = false;
    for (const fam of this.families) {
      fam.state = 'away';
      for (const p of fam.members) this.hide(p);
      fam.food?.hide();
      fam.moto?.hide();
      fam.hammock?.rig.hide();
    }
    this.seller?.hide();
    this.cook?.hide();
    this.eater?.hide();
    this.goods?.hide();
    this.sellPath = [];
    this.splash?.stop();
  }
}

/**
 * A splash in the pool: a ring of white foam spreading and sinking, drops
 * thrown up and falling back (boxes of the people's things, only while it lasts).
 */
class Splash {
  static readonly N = 12;
  private readonly base: number;
  private t0 = -1e9;
  private x = 0;
  private y = 0;
  private z = 0;
  private size = 1;
  private live = false;

  constructor(private readonly things: Things) {
    this.base = things.alloc(Splash.N);
    for (let k = 0; k < Splash.N; k++) things.paint(this.base + k, k < 8 ? 0xf2f8fa : 0xe0f0f6);
  }

  start(x: number, y: number, z: number, now: number, size: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.t0 = now;
    this.size = size;
    this.live = true;
  }

  update(now: number): void {
    if (!this.live) return;
    const u = (now - this.t0) / 1.1;
    if (u >= 1 || u < 0) return this.stop();
    const k = this.size;
    // The ring: eight flat pieces spreading out and sinking.
    const r = (0.25 + 1.1 * Math.sqrt(u)) * k;
    const h = (0.35 * (1 - u) + 0.04) * k;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.things.put(this.base + i, this.x + Math.sin(a) * r, this.y + h / 2 - 0.05, this.z + Math.cos(a) * r, 0.34 * k * (1 - 0.4 * u), h, 0.16 * k, a);
    }
    // The drops: up and back down.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const out = (0.2 + 0.7 * u) * k;
      const up = (2.6 * u - 2.8 * u * u) * k * (0.8 + 0.2 * i);
      this.things.put(this.base + 8 + i, this.x + Math.sin(a) * out, this.y + Math.max(0, up), this.z + Math.cos(a) * out, 0.12 * k, 0.16 * k, 0.12 * k, a);
    }
  }

  stop(): void {
    if (!this.live) return;
    this.live = false;
    this.things.hide(this.base, Splash.N);
  }
}

/** Where someone stands at a hut's front edge (local x), facing the fall. */
function edgeSpot(hut: KnHut, lx: number, plunge: { x: number; z: number }): Spot {
  const s = onHut(hut, lx, 1.05);
  return { x: s.x, y: s.y, z: s.z, yaw: Math.atan2(plunge.x - s.x, plunge.z - s.z) };
}

/** Someone sitting still: stepped every third frame (their time summed); 0 on the frames between. */
function slow(p: Picnicker, dt: number): number {
  p.acc += dt;
  if (++p.tick < 3) return 0;
  p.tick = 0;
  const d = p.acc;
  p.acc = 0;
  return d;
}
