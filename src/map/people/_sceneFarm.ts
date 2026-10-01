import { SURFACE, type HeightField } from '../heightfield';
import { PLOTS, plotSeason, SWEEP, type PlotPlan } from '../paddies/stages';
import { FARM } from '../roam/_farmLink';
import type { MapFrame } from '../types';
import { Actor } from './_actor';
import { Bubble } from './_bubble';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Look, type Pose } from './_personModel';
import type { Obstacle, Point, Traffic } from './_routes';
import { GONE, Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';

/**
 * Farmers in the rice paddies by the lake, through the year (`f.season`;
 * the paddies part, paddies.ts, grows the rice itself):
 *
 * - **planting** (≈ 0.08‥0.3): a row of four across a flooded plot, bent
 *   over, a bundle of seedlings in one hand, pushing them into the mud with
 *   the other, stepping slowly back along the rows (where a plot is being
 *   planted now: at its planting line; later, filling gaps and weeding in
 *   the young rice); one brings more seedlings on a shoulder pole along the
 *   dikes;
 * - **the rice growing** (≈ 0.3‥0.58): one weeding in a plot, one walking
 *   the dikes looking at the water, one resting under a sugar palm;
 * - **harvest** (≈ 0.6‥0.8): three reaping with sickles at the plot's
 *   cutting line, bent into the golden rice; one carrying sheaves home on a
 *   shoulder pole along the dike and the village trail; one resting;
 * - **the dry season**: one walking the dikes, one resting under a palm.
 *
 * Women and men of the village in palm-leaf hats or kramas. They greet the
 * explorer with a nod when he passes close. Home at night.
 *
 * The explorer may join them (roam/_farmWork.ts, through roam/_farmLink.ts
 * `FARM`): the scene tells it where the row is and where each of them
 * stands; the one at the row's end next to him straightens up, turns to him
 * and holds out a bundle of seedlings or her sickle (`POSE.give`), goes back
 * to work (without her sickle she gathers the cut stalks by hand), and at
 * the end comes over, takes it back, says "អរគុណ!" and gives him a parcel
 * of num ansom; the row waits for him while he works in it.
 */

/** Walking pace, working drift (m/s). */
const WALK = 0.75;
const WORK = 0.08;
/**
 * Spacing across a working row (m): the palm-leaf hat's brim is ≈ 1.5 m wide
 * at the people's scale, so the brims keep a hand apart.
 */
const ROW = 2.4;
/** Close to their place in the row, they shuffle along with it (m), not walk round to it. */
const SHUFFLE = 2;
/** Where the harvest carriers take the sheaves: the trail's west end by the village. */
const HOME: Point = { x: -272, y: 7.5, z: 83 };
/** Sugar palms to rest under (paddies/props.ts `PALMS`, on the dikes). */
const PALMS: [number, number][] = [
  [-189, 75],
  [-237, 62],
];
/** Night enough to be home (`night`). */
const DARK = 0.5;
/** (scratch points: a place in the working row, the explorer's face; used at once) */
const ROW_AT: Point = { x: 0, y: 0, z: 0 };
const EX_AT: Point = { x: 0, y: 0, z: 0 };
/** Working with the explorer: her walk over to him (m/s), her thanks' bubble (s), his eyes over his feet (m). */
const COME = 1.1;
const SAY = 2.6;
const EX_EYE = 2.0;
/** A parcel of num ansom (sticky rice in banana leaf) held out in thanks: the leaf, and its tie of banana fibre. */
const ANSOM_LEAF = 0x5a9a3a;

type Mode = 'plant' | 'grow' | 'harvest' | 'dry';

/** The farmers' work at a time of the year (`season`): the calendar of events asks it too (map/calendar.ts). */
export function farmModeOf(season: number): Mode {
  if (season >= 0.08 && season < 0.3) return 'plant';
  if (season >= 0.3 && season < 0.59) return 'grow';
  if (season >= 0.59 && season < 0.8) return 'harvest';
  return 'dry';
}
/** Night enough for the farmers to be home (`night`): the calendar's rice work is by day (map/calendar.ts). */
export const FARM_DARK = DARK;

interface Farmer {
  a: Actor;
  looks: Record<'seedlings' | 'sickle' | 'pole' | 'bare' | 'sheaves' | 'gift', Look>;
  job: 'row' | 'carry' | 'walk' | 'rest';
  /** Their place in the row (0‥; set by `order`, so no one crosses another walking over). */
  k: number;
  /** A walk: its points and how far along. */
  path: Point[];
  leg: number;
  nodAt: number;
}

export class Farmers implements PeopleScene {
  readonly name = 'farm';
  readonly actors: Actor[] = [];
  private readonly farmers: Farmer[] = [];
  private readonly pace = new Pace(170, 420);
  private mode: Mode | null = null;
  private plot: PlotPlan = PLOTS[2];
  /** Where the working row is in its plot (0‥1 along the sweep), and which way it drifts. */
  private front = 0.3;
  private dir = 1;
  private shown = false;
  /** The row is at its plot's planting or cutting line, moving with the season (else drifting back and forth). */
  private sweeping = false;
  private readonly rest: Point[];
  private readonly field: HeightField;
  /** Working with the explorer: the act last started (`FARM.helper.n`), her words over her head and until when. */
  private seenAct = 0;
  private readonly bubble = new Bubble();
  private talking = -1e9;
  private readonly head: Point = { x: 0, y: 0, z: 0 };

  constructor(private readonly env: PeopleEnv) {
    const { crowd, ground } = env;
    this.field = ground.field;
    const who: ['f' | 'm', 'palm' | 'krama'][] = [
      ['f', 'palm'],
      ['f', 'krama'],
      ['m', 'palm'],
      ['f', 'palm'],
      ['m', 'krama'],
    ];
    who.forEach(([sex, hat], k) => {
      const base = dress('villager', 801 + k * 3, { sex, hat });
      const look = (props: number[], carry: number, prop: number, prop2: number): Look => {
        const colors = base.colors.slice();
        colors[SLOT.prop] = prop;
        colors[SLOT.prop2] = prop2;
        const feats = base.feats.filter((f) => f !== FEAT.pole && f !== FEAT.seedlings && f !== FEAT.sickle);
        return { ...base, colors, feats: [...feats, ...(props as Look['feats'])], carry: carry as Look['carry'] };
      };
      const a = new Actor(crowd, base, ground).avoid(env.traffic, this.name);
      this.actors.push(a);
      this.farmers.push({
        a,
        looks: {
          seedlings: look([FEAT.seedlings], CARRY.none, 0x8cc04a, 0x5a4230),
          sickle: look([FEAT.sickle], CARRY.none, 0xd8b860, 0x7a5a30),
          pole: look([FEAT.pole], CARRY.pole, 0x86b848, 0x5a4230),
          sheaves: look([FEAT.pole], CARRY.pole, 0xd8b860, 0x8a6a34),
          bare: look([], CARRY.none, 0xd8b860, 0x7a5a30),
          gift: look([FEAT.parcel], CARRY.none, 0xd8b860, ANSOM_LEAF),
        },
        job: 'rest',
        k,
        path: [],
        leg: 0,
        nodAt: -1e9,
      });
    });
    this.rest = PALMS.map(([x, z]) => this.besidePalm(x, z));
  }

  /** A spot on the dike a step from the palm near (x, z) (the palm stands on the dike: paddies/props.ts). */
  private besidePalm(x: number, z: number): Point {
    const f = this.field;
    let best: [number, number] = [x, z];
    let bd = Infinity;
    for (let dz = -5; dz <= 5; dz += 1)
      for (let dx = -5; dx <= 5; dx += 1) {
        const px = x + dx;
        const pz = z + dz;
        if (f.surfaceAt(px, pz) !== SURFACE.dirt) continue;
        const d = Math.hypot(dx, dz);
        if (d < bd) [bd, best] = [d, [px, pz]];
      }
    // (a metre and a half along the dike from the trunk)
    for (const [ox, oz] of [
      [0, -1.6],
      [0, 1.6],
      [-1.6, 0],
      [1.6, 0],
    ])
      if (f.surfaceAt(best[0] + ox, best[1] + oz) === SURFACE.dirt) return { x: best[0] + ox, y: f.heightAt(best[0] + ox, best[1] + oz), z: best[1] + oz };
    return { x: best[0] + 1.2, y: f.heightAt(best[0], best[1]), z: best[1] };
  }

  private modeOf(season: number): Mode {
    return farmModeOf(season);
  }

  /** The plot being worked (planted or cut now, else the one done last), and where its working line is (0‥1). */
  private pickPlot(season: number, mode: Mode): void {
    if (mode !== 'plant' && mode !== 'harvest') return;
    let best: PlotPlan | null = null;
    let bestAge = Infinity;
    for (const pl of PLOTS) {
      const s = plotSeason(season, pl.lag);
      const start = mode === 'plant' ? pl.plant : pl.cut;
      const age = s - start;
      // (in its sweep now: that one; else at planting the one planted last (tending it), at harvest the next to be cut)
      const key = age >= 0 && age <= SWEEP ? -1 : mode === 'plant' ? (age > SWEEP ? age : 1 - age) : age < 0 ? -age : 1 + age;
      if (key < bestAge) {
        bestAge = key;
        best = pl;
      }
    }
    if (!best) return;
    const s = plotSeason(season, best.lag);
    const age = (s - (mode === 'plant' ? best.plant : best.cut)) / SWEEP;
    const moved = best !== this.plot;
    if (moved) this.front = age >= 0 && age <= 1 ? age : mode === 'harvest' ? 0.06 : 0.3;
    this.plot = best;
    if (moved) this.order();
    // (in the sweep: at its line; after it, drifting back and forth over the plot)
    this.sweeping = age >= 0 && age <= 1;
    // (the explorer working in the row: it waits for him, and catches up after)
    if (this.sweeping && !FARM.helper.working) this.front = age;
  }

  /**
   * Who takes which place in the row (on a new plot or a new season's jobs):
   * the choice that walks them the least in all, so nobody's way over crosses
   * anyone else's (≤ 4 in the row: 24 choices, tried once).
   */
  private order(): void {
    const row = this.farmers.filter((fm) => fm.job === 'row');
    const n = row.length;
    const spots = row.map((_, k) => {
      const p = this.rowSpot(k, n);
      return [p.x, p.z];
    });
    let best: number[] = row.map((_, k) => k);
    let bestD = Infinity;
    const perm = (done: number[], left: number[]) => {
      if (!left.length) {
        let d = 0;
        done.forEach((k, j) => (d += (row[j].a.x - spots[k][0]) ** 2 + (row[j].a.z - spots[k][1]) ** 2));
        if (d < bestD) [bestD, best] = [d, done];
        return;
      }
      for (const k of left) perm([...done, k], left.filter((q) => q !== k));
    };
    perm([], best);
    row.forEach((fm, j) => (fm.k = best[j]));
  }

  /** Place `k` of `n` across the working row (spaced closer only if the plot is too narrow). */
  private rowSpot(k: number, n: number): Point {
    const p = this.plot.paddy;
    const room = (this.plot.rowsX ? p.w : p.d) - 2 * 1.6;
    const gap = n > 1 ? Math.min(ROW, room / (n - 1)) : 0;
    return this.inPlot(this.front, (Math.min(k, n - 1) - (n - 1) / 2) * gap);
  }

  /** A point in the working plot: `u` along its sweep (0‥1), `v` metres across it from its middle (`ROW_AT`, overwritten next call). */
  private inPlot(u: number, v: number): Point {
    const p = this.plot.paddy;
    const margin = 1.4;
    let x: number;
    let z: number;
    if (this.plot.rowsX) {
      z = p.z - p.d / 2 + margin + (p.d - 2 * margin) * u;
      x = p.x + Math.max(-p.w / 2 + margin, Math.min(p.w / 2 - margin, v));
    } else {
      x = p.x + p.w / 2 - margin - (p.w - 2 * margin) * u;
      z = p.z + Math.max(-p.d / 2 + margin, Math.min(p.d / 2 - margin, v));
    }
    ROW_AT.x = x;
    ROW_AT.y = this.field.heightAt(x, z);
    ROW_AT.z = z;
    return ROW_AT;
  }

  /** Heading of the sweep in the working plot (the way the planting / cutting line moves). */
  private sweepYaw(): number {
    return this.plot.rowsX ? 0 : -Math.PI / 2;
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const p = this.plot.paddy;
    const step = this.pace.step(dt, viewDist(f, p.x, p.z));
    const night = f.night > DARK || f.night > GONE;
    // (her thanks over her head, every frame)
    if (now <= this.talking) this.bubble.update(dt, f.camera, f.roam !== 'overview');
    if (step < 0 || night) {
      if (this.shown) for (const fm of this.farmers) fm.a.hide();
      this.shown = false;
      this.mode = null;
      FARM.shown = false;
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const mode = this.modeOf(f.season);
    this.pickPlot(f.season, mode);
    if (mode !== this.mode) this.assign(mode, now);
    this.shown = true;
    // The working row drifts slowly along the plot, back and forth (planting: backwards; reaping: forwards); it
    // waits while the explorer works in it.
    if (!FARM.helper.working) this.front += this.dir * WORK * dt / Math.max(8, this.plot.rowsX ? p.d : p.w);
    if (this.front > 0.95 || this.front < 0.05) {
      this.dir = this.front > 0.95 ? -1 : 1;
      this.front = Math.max(0.05, Math.min(0.95, this.front));
    }
    for (let k = 0; k < this.farmers.length; k++) this.farmer(this.farmers[k], k, dt, now, mode, ex, f);
    this.link(mode);
  }

  /** Tell the explorer's side (roam/_farmLink.ts) where the row is, its ends, and where everyone stands. */
  private link(mode: Mode): void {
    const pl = this.plot;
    const p = pl.paddy;
    FARM.shown = true;
    FARM.work = mode;
    FARM.plot = pl.index;
    FARM.front = this.front;
    // (at the planting or cutting line the row goes on with the sweep; else the way it drifts)
    FARM.ahead = this.sweeping ? 1 : this.dir;
    FARM.ux = pl.rowsX ? 0 : -1;
    FARM.uz = pl.rowsX ? 1 : 0;
    let n = 0;
    for (const fm of this.farmers) if (fm.job === 'row') n++;
    const room = (pl.rowsX ? p.w : p.d) - 2 * 1.6;
    const gap = n > 1 ? Math.min(ROW, room / (n - 1)) : ROW;
    FARM.rowN = n;
    FARM.gap = gap;
    // (one more place at either end of the row, if it is on the plot's floor clear of its dikes)
    const half = (pl.rowsX ? p.w : p.d) / 2 - 1.4 - 0.6;
    for (let e = 0; e < 2; e++) {
      const v = (e === 0 ? -1 - (n - 1) / 2 : n - (n - 1) / 2) * gap;
      const at = this.inPlot(this.front, v);
      const end = FARM.ends[e];
      end.x = at.x;
      end.z = at.z;
      end.ok = n > 0 && Math.abs(v) <= half;
    }
    for (let k = 0; k < this.farmers.length && k < FARM.farmers.length; k++) {
      const a = this.farmers[k].a;
      const o = FARM.farmers[k];
      o.x = a.x;
      o.y = a.y;
      o.z = a.z;
      o.yaw = a.yaw;
      o.job = this.farmers[k].job;
      o.shown = a.shown;
    }
  }

  /** What a farmer holds for her job in the season (the row's sickle lent to the explorer: her bare hands). */
  private jobLook(fm: Farmer, k: number, mode: Mode): Look {
    if (fm.job === 'row') {
      if (mode === 'harvest') return FARM.helper.sickle && FARM.helper.with === k ? fm.looks.bare : fm.looks.sickle;
      return mode === 'plant' ? fm.looks.seedlings : fm.looks.bare;
    }
    if (fm.job === 'carry') return mode === 'harvest' ? fm.looks.sheaves : fm.looks.pole;
    return fm.looks.bare;
  }

  private dress(a: Actor, look: Look): void {
    if (a.look === look) return;
    a.look = look;
    this.env.crowd.dress(a.i, look);
  }

  /**
   * Working with the explorer (`FARM.helper`, roam/_farmWork.ts): she turns to him, holds out what she lends him,
   * comes over, takes it back, thanks him with a parcel. True: she is his now (her own work waits).
   */
  private helping(fm: Farmer, k: number, now: number, mode: Mode, f: MapFrame): boolean {
    const h = FARM.helper;
    if (h.with !== k || h.act === 'none' || h.act === 'lent') return false;
    const a = fm.a;
    const fresh = h.n !== this.seenAct;
    this.seenAct = h.n;
    // What is in her hands: her tool (or nothing while he has her sickle), both hands out for it, the parcel.
    const tool = mode === 'harvest' ? (h.sickle ? fm.looks.bare : fm.looks.sickle) : fm.looks.seedlings;
    this.dress(a, h.act === 'thank' ? fm.looks.gift : h.act === 'take' ? fm.looks.bare : tool);
    if (h.warp) {
      // (a check's state from the URL: she is there already, facing him)
      h.warp = false;
      a.warp(h.tx, this.field.heightAt(h.tx, h.tz), h.tz, Math.atan2(h.x - h.tx, h.z - h.tz));
    }
    if (h.act === 'come') {
      a.goTo(h.tx, h.tz, COME);
      a.face(a.yawTo(h.x, h.z));
    } else {
      a.stop();
      a.face(a.yawTo(h.x, h.z));
    }
    a.pose(h.act === 'give' || h.act === 'take' || h.act === 'thank' ? POSE.give : POSE.stand, now);
    EX_AT.x = h.x;
    EX_AT.y = h.y + EX_EYE;
    EX_AT.z = h.z;
    a.lookAt(EX_AT, now + 0.5);
    a.tilt(0);
    if (fresh && h.act === 'thank') {
      // "អរគុណ!" over her head, and her voice (audio/people.ts).
      this.bubble.say('farmThanks', this.headOf(a), SAY);
      this.talking = now + SAY + 1;
      const s = a.crowd.scale(a.i);
      if (f.dt > 0 && !this.env.shot) f.calls.push({ kind: 'hello', x: a.x, y: a.y + 1.6 * s, z: a.z, gain: 0.8, size: 1.7 * s });
    }
    return true;
  }

  /** Her head (for the bubble), followed as she moves. */
  private headOf(a: Actor): () => Point {
    return () => {
      this.head.x = a.x;
      this.head.y = a.y + 2.9 * (a.crowd.scale(a.i) / 1.4);
      this.head.z = a.z;
      return this.head;
    };
  }

  /** Jobs for the season, and the look for each. */
  private assign(mode: Mode, now: number): void {
    this.mode = mode;
    const jobs: Record<Mode, Farmer['job'][]> = {
      plant: ['row', 'row', 'row', 'row', 'carry'],
      grow: ['row', 'walk', 'rest', 'rest', 'rest'],
      harvest: ['row', 'row', 'row', 'carry', 'rest'],
      dry: ['walk', 'rest', 'rest', 'rest', 'rest'],
    };
    this.farmers.forEach((fm, k) => (fm.job = jobs[mode][k]));
    this.order();
    this.farmers.forEach((fm, k) => {
      // (only two resting spots: the others of the season are away)
      fm.job = jobs[mode][k];
      const look =
        fm.job === 'row' ? (mode === 'harvest' ? fm.looks.sickle : mode === 'plant' ? fm.looks.seedlings : fm.looks.bare) : fm.job === 'carry' ? (mode === 'harvest' ? fm.looks.sheaves : fm.looks.pole) : fm.looks.bare;
      if (fm.a.look !== look) {
        fm.a.look = look;
        this.env.crowd.dress(fm.a.i, look);
      }
      fm.path = [];
      fm.leg = 0;
      // (put them at their places at once: a still, or the season turning while away)
      const at = this.place(fm, 0);
      if (at) {
        fm.a.warp(at.x, at.y, at.z, this.sweepYaw());
        fm.a.show();
        fm.a.carry(1, now);
      } else fm.a.hide();
    });
  }

  /** Where a farmer belongs now (null: away). */
  private place(fm: Farmer, _now: number): Point | null {
    if (fm.job === 'row' || fm.job === 'rest') {
      // (their place among those on the same job, and how many there are)
      let k = -1;
      let n = 0;
      for (const o of this.farmers) {
        if (o.job !== fm.job) continue;
        if (o === fm) k = n;
        n++;
      }
      if (fm.job === 'row') return this.rowSpot(fm.k, n);
      return k < this.rest.length ? this.rest[k] : null;
    }
    // Walkers and carriers: along the path they are on (made when needed).
    if (!fm.path.length) fm.path = this.walkPath(fm);
    return fm.path[Math.min(fm.leg, fm.path.length - 1)];
  }

  /**
   * A carrier's round trip (loaded out, back empty: the second half): at harvest from the reapers out of
   * the plot to the trail and west along it to the stacks near the village; at planting from the nursery
   * bed (plot 3's east strip) along the trail to the planters. A walker: along the trail, up a dike or two and back.
   */
  private walkPath(fm: Farmer): Point[] {
    const p = this.plot.paddy;
    const f = this.field;
    const pt = (x: number, z: number): Point => ({ x, y: f.heightAt(x, z), z });
    const edgeZ = p.z < 83 ? p.z + p.d / 2 - 1.5 : p.z - p.d / 2 + 1.5;
    let out: Point[];
    if (fm.job === 'carry' && this.mode === 'harvest') out = [pt(p.x, edgeZ), pt(p.x, 83), pt(HOME.x, 83)];
    else if (fm.job === 'carry') out = [pt(-192, 72), pt(-192, 83), pt(p.x, 83), pt(p.x, edgeZ)];
    else return [pt(-261, 83), pt(-237, 83), pt(-237, 63), pt(-237, 83), pt(-219, 83), pt(-219, 102), pt(-219, 83), pt(-211, 83), pt(-211, 63), pt(-211, 83)].concat([pt(-261, 83)]);
    return [...out, ...out.slice(0, -1).reverse()];
  }

  private farmer(fm: Farmer, k: number, dt: number, now: number, mode: Mode, ex: Obstacle | null, f: MapFrame): void {
    const a = fm.a;
    const at = this.place(fm, now);
    if (!at) {
      if (a.shown) a.hide();
      return;
    }
    if (!a.shown) {
      a.warp(at.x, at.y, at.z, this.sweepYaw());
      a.show();
    }
    // (working with the explorer: what she does for him, her own work waiting)
    if (this.helping(fm, k, now, mode, f)) {
      a.step(dt, now);
      return;
    }
    let pose: Pose = POSE.stand;
    if (fm.job === 'row') {
      // (back from lending him her bundle or sickle, or with it lent: what she holds for her work)
      this.dress(a, this.jobLook(fm, k, mode));
      const working = mode === 'plant' || mode === 'harvest' || mode === 'grow';
      // (planters face the planted rows as they step back; reapers face the standing rice)
      const yaw = this.sweepYaw() + (mode === 'plant' ? (this.dir > 0 ? Math.PI : 0) : this.dir > 0 ? 0 : Math.PI);
      // Far from their place: walk there. In the row: the whole row shuffles along together, each straight
      // back (or on) with it, never turning round to walk to a place a few centimetres away.
      if (a.dist(at.x, at.z) > SHUFFLE) a.goTo(at.x, at.z, WALK);
      else a.shuffle(at.x, at.z, 0.4 * dt);
      a.face(yaw);
      if (working && a.dist(at.x, at.z) < 1.2) pose = mode === 'harvest' ? POSE.reap : POSE.plant;
    } else if (fm.job === 'rest') {
      a.goTo(at.x, at.z, WALK);
      // (sitting under the palm, looking over the plots)
      a.face(Math.atan2(this.plot.paddy.x - at.x, this.plot.paddy.z - at.z));
      if (a.dist(at.x, at.z) < 0.4) pose = POSE.sit;
    } else {
      a.goTo(at.x, at.z, WALK);
      a.face(null);
      a.carry(1, now);
      if (a.dist(at.x, at.z) < 0.4) {
        fm.leg++;
        if (fm.leg >= fm.path.length) {
          // (round again; a carrier takes the next load from the plot it is worked now)
          fm.leg = 0;
          if (fm.job === 'carry') fm.path = this.walkPath(fm);
        }
      }
      // (a carrier: loaded on the way out, empty-handed back)
      if (fm.job === 'carry') {
        const loaded = fm.leg < fm.path.length / 2;
        const look = loaded ? (mode === 'harvest' ? fm.looks.sheaves : fm.looks.pole) : fm.looks.bare;
        if (a.look !== look) {
          a.look = look;
          this.env.crowd.dress(a.i, look);
        }
      }
    }
    a.pose(pose, now);
    // A nod to the explorer passing close.
    if (ex && a.dist(ex.x, ex.z) < 4 && now - fm.nodAt > 40) fm.nodAt = now;
    const u = now - fm.nodAt;
    if (ex && u < 2.5) {
      EX_AT.x = ex.x;
      EX_AT.y = ex.y + 2;
      EX_AT.z = ex.z;
      a.lookAt(EX_AT, now + 0.3);
    }
    else a.lookAt(null);
    a.tilt(u > 0.5 && u < 1.3 ? 0.7 : 0);
    a.step(dt, now);
  }

  report(traffic: Traffic): void {
    for (const fm of this.farmers) if (fm.a.shown) traffic.add(this.name, fm.a.x, fm.a.y, fm.a.z);
  }
}
