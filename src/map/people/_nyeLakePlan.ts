import { mulberry32 } from '../../voxel/random';
import { folk } from '../festival/_folk';
import type { HeightField } from '../heightfield';
import { LAKES } from '../layout';
import { LAKE_SHORE, LAKE_STAGE, onLakeShore } from '../nye/plan';
import type { WalkMap } from '../roam/walkmap';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, SLOT, type Look } from './_personModel';
import { Ground } from './_routes';
import { RigDef } from './_things';

/**
 * The lakeside New Year's Eve crowd's plan (people/_sceneNyeLake.ts): the floating village's families and the
 * fishermen's on the shore terrace (nye/plan.ts `LAKE_SHORE`) facing the floating stage (`LAKE_STAGE`), their boats
 * moored on the water beside it, the children's lotus candles. Made once, seeded, checked against the height field
 * (dry ground for everyone on land, open water for the boats and the candles). No three.js but the rigs' definitions.
 *
 * The stage's frame (as the venue's, nye/_lkKit.ts `lakeFrame`): `u` across the stage (+u toward the north-west),
 * `v` toward the shore (the way it faces). The venue (nye/_lkShore.ts) paves the terrace's ellipse and a landing from
 * it down to the bank (|u| ≤ 9.5), builds the ghat — steps down the bank's 2 m drop to an apron on the sand and on into
 * the water, strip by strip (|u| ≤ 8.5) — and the jetty down its middle (|u| ≤ 1.5) to the deck. `LakeSite` follows the
 * same rules from the height field, so the people stand on the steps and walk the jetty without reading the venue's
 * blocks (the people's walk map does not hold them). The jetty and the pale way up the terrace's middle stay open
 * (`LANE`), and the terrace's rim (its lamps on pedestals, the lantern poles) keeps `EDGE` m clear.
 */

/** The great lake's water (m). */
export const WATER = LAKES[0].level;
/** The terrace's pavers over the land (nye/_lkShore.ts `TOP`). */
export const LAKE_PAVING = 0.08;

/** The stage's axes: `F` the way it faces (toward the shore), `R` across it. */
const FX = Math.sin(LAKE_STAGE.yaw);
const FZ = Math.cos(LAKE_STAGE.yaw);
const RX = Math.cos(LAKE_STAGE.yaw);
const RZ = -Math.sin(LAKE_STAGE.yaw);

/** The point (u across, v toward the shore) of the stage's frame, into `out`. */
export function stagePt(u: number, v: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = LAKE_STAGE.x + RX * u + FX * v;
  out.z = LAKE_STAGE.z + RZ * u + FZ * v;
  return out;
}
/** (x, z) in the stage's frame (into `out`: x = u, z = v). */
export function toStage(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const dx = x - LAKE_STAGE.x;
  const dz = z - LAKE_STAGE.z;
  out.x = dx * RX + dz * RZ;
  out.z = dx * FX + dz * FZ;
  return out;
}
const Q = { x: 0, z: 0 };
const pt = (u: number, v: number) => {
  stagePt(u, v, Q);
  return { x: Q.x, z: Q.z };
};

/** The terrace's middle in the stage's frame. */
const T_UV = (() => {
  const o = { x: 0, z: 0 };
  toStage(LAKE_SHORE.x, LAKE_SHORE.z, o);
  return o;
})();
/** The stage's front edge (v). */
export const STAGE_FRONT = LAKE_STAGE.d / 2;
/** The open lane round the jetty and the way up the terrace's middle (|u| m), the rim's margin (m). */
const LANE = 2.3;
const EDGE = 1.8;
/** The venue's ghat and jetty (half widths across, m), its steps (nye/_lkShore.ts). */
const GHAT = 8.5;
const JETTY = 1.5;
const RISE = 0.25;
const RUN = 0.5;
const WET_STEP = 0.33;

/**
 * The lake venue's ground as the people need it (from the height field, by the venue's own rules: nye/_lkShore.ts):
 * the water's level and the deck's, the bank and the water's edge per 1 m strip across the ghat, the terrace's paving,
 * the ghat's step tops, the jetty's slope.
 */
export class LakeSite {
  /** The lake's level under the stage, the deck's top, the terrace's top (the meadow 3 m over the lake, paved). */
  readonly water: number;
  readonly deck: number;
  readonly top: number;
  /** Per strip u = −8‥8 (index u + 8): the bank's edge (v) and the water's (v). */
  readonly bank = new Float32Array(17);
  readonly edge = new Float32Array(17);
  /** The jetty runs from the deck's front (v `jEnd`) up to the terrace (`jStart`). */
  readonly jEnd = LAKE_STAGE.d / 2 - 0.05;
  readonly jStart: number;
  private readonly o = { x: 0, z: 0 };

  constructor(readonly field: HeightField) {
    // (the lake's level under the stage: its middle, else behind it: as lakeFrame)
    let w = field.waterAt(LAKE_STAGE.x, LAKE_STAGE.z);
    for (let r = 2; w === null && r < 14; r += 2) w = field.waterAt(LAKE_STAGE.x - FX * r, LAKE_STAGE.z - FZ * r);
    this.water = w ?? WATER;
    this.deck = this.water + LAKE_STAGE.deck;
    this.top = this.water + 3 + LAKE_PAVING;
    const wet = (u: number, v: number) => {
      stagePt(u, v, Q);
      return field.waterAt(Q.x, Q.z) !== null;
    };
    for (let k = 0; k <= 16; k++) {
      const u = k - 8;
      let bank = 40;
      for (let v = 40; v > 0; v -= 0.25) {
        stagePt(u, v, Q);
        if (field.heightAt(Q.x, Q.z) < 7.5 || wet(u, v)) {
          bank = v + 0.25;
          break;
        }
      }
      let edge = bank;
      for (let v = bank; v > -10; v -= 0.25)
        if (wet(u, v)) {
          edge = v + 0.25;
          break;
        }
      this.bank[k] = bank;
      this.edge[k] = edge;
    }
    this.jStart = this.bank[8] + 0.6;
  }

  /** The ghat's strip under (u) (−8‥8), or −1 off it (and under the jetty). */
  private strip(u: number): number {
    const k = Math.round(u);
    if (Math.abs(u) > GHAT || Math.abs(k) < JETTY + 0.3 || Math.abs(k) > 8) return -1;
    return k + 8;
  }

  /**
   * The top of the ghat's step at (u, v) (as the venue lays them: 0.5 m runs, 0.25 m rises down to an apron 1 m over
   * the lake, then 0.33 m steps into it), or NaN off the steps.
   */
  stepTop(u: number, v: number): number {
    const k = this.strip(u);
    if (k < 0) return NaN;
    const bank = this.bank[k];
    if (v > bank || bank - this.edge[k] > 14) return NaN;
    let y = this.top;
    let at = bank;
    for (let n = 0; n < 40; n++) {
      const wetCell = at - RUN / 2 < this.edge[k];
      const top = wetCell ? Math.min(y, this.water + 1 + LAKE_PAVING) - WET_STEP : Math.max(this.water + 1 + LAKE_PAVING, y - RISE);
      if (wetCell && top < this.water - 0.75) return NaN;
      if (v >= at - RUN) return top;
      y = top;
      at -= RUN;
    }
    return NaN;
  }

  /** The jetty's planks' top at v (on its middle; NaN off it). */
  jettyY(u: number, v: number): number {
    if (Math.abs(u) > JETTY || v < this.jEnd || v > this.jStart) return NaN;
    return this.deck + (this.top - this.deck) * ((v - this.jEnd) / (this.jStart - this.jEnd));
  }

  /** Paved: the terrace's ellipse, or its landing from there down to the bank. */
  paved(x: number, z: number): boolean {
    if (onLakeShore(x, z)) return true;
    const o = toStage(x, z, this.o);
    return Math.abs(o.x) <= GHAT + 1 && o.z <= T_UV.z && o.z >= this.bank[Math.max(0, Math.min(16, Math.round(o.x) + 8))] - 0.05;
  }
}

/** The people's floor (`_routes.ts` `Ground`): the terrace's pavers, the ghat's steps, the jetty. */
export class LakeGround extends Ground {
  private readonly o = { x: 0, z: 0 };
  constructor(
    readonly site: LakeSite,
    walk: WalkMap | null,
  ) {
    super(site.field, walk);
  }

  override at(x: number, z: number, y: number): number {
    const o = toStage(x, z, this.o);
    if (o.z < 40 && Math.abs(o.x) < 12) {
      const j = this.site.jettyY(o.x, o.z);
      if (Number.isFinite(j) && y > j - 1) return j;
      const s = this.site.stepTop(o.x, o.z);
      if (Number.isFinite(s)) return s;
    }
    const g = super.at(x, z, y);
    return Number.isFinite(g) && this.site.paved(x, z) ? g + LAKE_PAVING : g;
  }
}

/** Dry land at least `over` m over the lake. */
function dry(field: HeightField, x: number, z: number, over: number): boolean {
  const w = field.waterAt(x, z);
  if (w !== null && w > field.heightAt(x, z) - 0.05) return false;
  return field.heightAt(x, z) > WATER + over;
}

/** Open water at least `deep` m deep. */
export function openWater(field: HeightField, x: number, z: number, deep: number): boolean {
  const w = field.waterAt(x, z);
  return w !== null && w - field.heightAt(x, z) >= deep;
}

/** Off the stage's deck (with a margin m). */
function offStage(x: number, z: number, margin: number): boolean {
  const o = toStage(x, z, { x: 0, z: 0 });
  return Math.abs(o.x) > LAKE_STAGE.w / 2 + margin || Math.abs(o.z) > LAKE_STAGE.d / 2 + margin;
}

export type LakeRole =
  /** Stands on the terrace. */
  | 'stand'
  /** Sits on a family's mat at the terrace's front. */
  | 'sit'
  /** An elder on a low stool behind the family's mat. */
  | 'stool'
  /** A child of a mat family who goes down to the water's edge to set lotus candles afloat (`LOTUS_FROM`‥`LOTUS_TO`). */
  | 'lotus';

export interface LakeMember {
  look: Look;
  role: LakeRole;
  group: number;
  /** Their place and their facing there (the stage). */
  x: number;
  z: number;
  yaw: number;
  kid: boolean;
  phone: boolean;
  sparkler: boolean;
  jumps: boolean;
  /** A partner to turn to at midnight (−1: none). */
  partner: number;
  /** Behind the family's lead (m) and to the side (−1‥1). */
  lag: number;
  side: number;
  /** From the floating village up the east shore trail, onto the terrace, to their place (x, z pairs), its lengths. */
  route: Float32Array;
  cum: Float32Array;
  /** The trail's length on the route (the lane fades out after it: single file onto the terrace). */
  trail: number;
  low: boolean;
  /** `lotus`: the step at the water's edge (x, z, its top y, facing the water), and which of the children (0, 1). */
  wx: number;
  wz: number;
  wy: number;
  wyaw: number;
  lotus: number;
}

export interface LakeGroup {
  start: number;
  leave: number;
  v: number;
}

/** Someone in a boat: their seat (boat space: x across, z along, +z the bow), sitting or (a child at midnight) standing up. */
export interface Crew {
  look: Look;
  seat: [number, number];
  kid: boolean;
  /** Paddles the boat in and out (sits at the stern). */
  paddler: boolean;
}

export interface LakeBoat {
  /** Moored here, heading `yaw` (bow toward the stage), the water's level. */
  x: number;
  z: number;
  yaw: number;
  /** Paddled in from the floating village along this way (x, z pairs, ending at the mooring) and its lengths. */
  route: Float32Array;
  cum: Float32Array;
  /** Sets out, arrives (s from midnight); casts off for home; pace (m/s). */
  start: number;
  leave: number;
  v: number;
  crew: Crew[];
  low: boolean;
  /** The lantern's colour. */
  lamp: number;
}

export interface Candle {
  /** Set afloat at (x, z) at `t` (s from midnight), drifting along (dx, dz) at `v` m/s for at most `far` m (open water). */
  x: number;
  z: number;
  dx: number;
  dz: number;
  t: number;
  far: number;
  v: number;
}

export interface LakeCrowdPlan {
  members: LakeMember[];
  groups: LakeGroup[];
  boats: LakeBoat[];
  candles: Candle[];
  /** The mats (middle, facing) and the stools (x, z, yaw, the elder's member index). */
  mats: { x: number; z: number; yaw: number; group: number; low: boolean }[];
  stools: { x: number; z: number; yaw: number; member: number }[];
}

/** The crowd comes from 22:20 (s from midnight) and the last are home by 00:40. */
export const LAKE_COME = -6000;
export const LAKE_GONE = 2400;
/** The lotus candles: the children at the water's edge from, to (s from midnight); one set afloat every `CANDLE_EVERY` s. */
export const LOTUS_FROM = -3700;
export const LOTUS_TO = -240;
export const CANDLE_EVERY = 40;
/** How long a candle floats before it has burnt down (s). */
export const CANDLE_LIFE = 300;

/** The east shore trail from the floating village's north edge (layout.ts `TRAILS`) to the terrace's east side. */
const TRAIL: readonly [number, number][] = [
  [-290, 62],
  [-282, 46],
  [-278, 26],
  [-276, 0],
  [-282, -28],
  [-292, -60],
  [-306, -63],
];
/** In onto the terrace at its east rim. */
const ENTRY = { x: LAKE_SHORE.x + LAKE_SHORE.rx - 2.5, z: LAKE_SHORE.z + 1 };

function lengths(r: Float32Array): Float32Array {
  const n = r.length / 2;
  const c = new Float32Array(n);
  for (let k = 1; k < n; k++) c[k] = c[k - 1] + Math.hypot(r[2 * k] - r[2 * k - 2], r[2 * k + 1] - r[2 * k - 1]);
  return c;
}

function routeTo(x: number, z: number): { route: Float32Array; cum: Float32Array; trail: number } {
  const pts: number[] = [];
  for (const [px, pz] of TRAIL) pts.push(px, pz);
  pts.push(ENTRY.x, ENTRY.z, x, z);
  const route = new Float32Array(pts);
  const cum = lengths(route);
  return { route, cum, trail: cum[TRAIL.length - 1] };
}

/** The night's people: the floating village in its best (`festival/_folk.ts`), now and then a fisherman with a krama. */
function festive(role: 'woman' | 'man' | 'elder', seed: number, phone: boolean): Look {
  let l: Look;
  if (role === 'man' && seed % 4 === 0) {
    // (a fisherman as he is: the krama round the head, no net tonight)
    const f = dress('fisherman', seed);
    l = { ...f, feats: f.feats.filter((x) => x !== FEAT.net && x !== FEAT.hatPalm), carry: CARRY.none };
    l.colors = l.colors.slice();
    if (phone) l.feats = [...l.feats, FEAT.phone];
  } else l = folk(role, seed, phone ? { props: [FEAT.phone] } : {});
  if (phone) l.carry = CARRY.phone;
  l.kind = 'festival';
  return l;
}

function child(seed: number, sparkler: boolean): Look {
  const l = folk('kid', seed, sparkler ? { carry: CARRY.torch, props: [FEAT.torch] } : {});
  if (sparkler) {
    l.carry = CARRY.torch;
    l.colors[SLOT.flame] = 0xffd890;
    l.colors[SLOT.wood] = 0x8a8a86;
  }
  return l;
}

/** A child carrying a lotus candle down to the water (the lotus buds of the offering, `FEAT.offering`). */
function lotusChild(seed: number): Look {
  const l = folk('kid', seed, { props: [FEAT.offering] });
  l.colors[SLOT.prop] = 0xf2a8c0;
  l.colors[SLOT.prop2] = 0x5a9a3a;
  l.colors[SLOT.wood] = 0xa8322a;
  return l;
}

/**
 * The lakeside crowd: `max` people on the terrace at most (mat families at the front by the steps, an elder on a stool
 * behind each, the standing families behind them, the nearest the stage first), five boats of families before the
 * stage, the lotus candles.
 */
export function planLakeCrowd(site: LakeSite, max: number): LakeCrowdPlan {
  const field = site.field;
  const rnd = mulberry32(0x1a4e);
  const members: LakeMember[] = [];
  const groups: LakeGroup[] = [];
  const mats: LakeCrowdPlan['mats'] = [];
  const stools: LakeCrowdPlan['stools'] = [];
  const faceStage = (x: number, z: number) => Math.atan2(LAKE_STAGE.x + FX * STAGE_FRONT - x, LAKE_STAGE.z + FZ * STAGE_FRONT - z);
  const o = { x: 0, z: 0 };
  const bankAt = (u: number) => site.bank[Math.max(0, Math.min(16, Math.round(u) + 8))];
  const inLane = (x: number, z: number, pad: number) => {
    toStage(x, z, o);
    return o.z > STAGE_FRONT && Math.abs(o.x) < LANE + pad;
  };
  // (the lantern poles at the ghat's top corners and the terrace's sides: nye/_lkShore.ts)
  const poles = [
    pt(-(GHAT + 2.2), bankAt(-GHAT) + 1.6),
    pt(GHAT + 2.2, bankAt(GHAT) + 1.6),
    pt(-(GHAT + 8), bankAt(-GHAT) + 7),
    pt(GHAT + 8, bankAt(GHAT) + 7),
  ];
  /** On the terrace (its ellipse `edge` m in from the rim, or its landing above the bank), dry, clear of the poles. */
  const onTerrace = (x: number, z: number, edge: number) => {
    if (!dry(field, x, z, 1.2) || poles.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) return false;
    if (onLakeShore(x, z, -edge)) return true;
    toStage(x, z, o);
    return Math.abs(o.x) <= GHAT - 0.5 && o.z >= bankAt(o.x) + 1 && o.z <= T_UV.z;
  };
  const add = (m: Omit<LakeMember, 'route' | 'cum' | 'trail' | 'yaw' | 'partner' | 'lag' | 'side' | 'jumps' | 'wx' | 'wz' | 'wy' | 'wyaw' | 'lotus'> & Partial<LakeMember>): number => {
    const r = routeTo(m.x, m.z);
    const k = members.filter((p) => p.group === m.group).length;
    members.push({ yaw: faceStage(m.x, m.z), partner: -1, jumps: m.kid, lag: k * 1.1, side: k % 2 ? -0.9 : 0.9, wx: 0, wz: 0, wy: 0, wyaw: 0, lotus: -1, ...m, ...r });
    return members.length - 1;
  };
  let seed = 9700;
  // ── The mats on the landing at the top of the ghat (the steps down to the water), two each side of the jetty, and a
  // row behind them (each as near the bank as the landing lets it) ──
  const matU: readonly [number, number][] = [
    [-7.0, 2.0],
    [-4.2, 2.0],
    [4.2, 2.0],
    [7.0, 2.0],
    [-5.6, 5.6],
    [5.6, 5.6],
  ];
  let lotusKids = 0;
  for (const [u0, back] of matU) {
    let best: { x: number; z: number } | null = null;
    for (let v = Math.max(bankAt(u0 - 1.4), bankAt(u0 + 1.4)) + back; v < T_UV.z + 8; v += 0.25) {
      const p = pt(u0, v);
      if (onTerrace(p.x, p.z, EDGE + 1.2) && !inLane(p.x, p.z, 1.5)) {
        best = p;
        break;
      }
    }
    if (!best) continue;
    const g = groups.length;
    groups.push({ start: 0, leave: 0, v: 0.85 });
    const yaw = LAKE_STAGE.yaw;
    const mi = mats.length;
    const lowFamily = mi % 2 === 0;
    mats.push({ x: best.x, z: best.z, yaw, group: g, low: lowFamily });
    // (four on the mat: a grandmother, a mother, two children; the two families west of the jetty send a child down
    // the steps with lotus candles)
    for (let j = 0; j < 4; j++) {
      const a = ((j % 2) - 0.5) * 1.25;
      const b = (Math.floor(j / 2) - 0.5) * 0.95;
      const x = best.x + RX * a - FX * b;
      const z = best.z + RZ * a - FZ * b;
      const kid = j >= 2;
      const lotus = kid && j === 3 && u0 < 0 && back < 3 && lotusKids < 2;
      const look = lotus ? lotusChild(seed++) : kid ? child(seed++, j === 2 && mi % 3 === 0) : festive(j === 0 ? 'elder' : 'woman', seed++, j === 1);
      const k = add({ look, role: lotus ? 'lotus' : 'sit', group: g, x, z, kid, phone: j === 1, sparkler: kid && !lotus && j === 2 && mi % 3 === 0, low: lowFamily });
      if (lotus) {
        const w = ghatEdge(site, Math.round(u0));
        if (w) {
          const m = members[k];
          m.wx = w.x;
          m.wz = w.z;
          m.wy = w.y;
          m.wyaw = Math.atan2(-FX, -FZ);
          m.lotus = lotusKids++;
        } else members[k].role = 'sit';
      }
    }
    // (the grandfather on his stool behind the mat)
    const sx = best.x + FX * 1.7;
    const sz = best.z + FZ * 1.7;
    if (onTerrace(sx, sz, EDGE)) {
      const k = add({ look: festive('elder', seed++, false), role: 'stool', group: g, x: sx, z: sz, kid: false, phone: false, sparkler: false, low: lowFamily, jumps: false });
      stools.push({ x: sx, z: sz, yaw: members[k].yaw, member: k });
    }
  }
  // ── Places to stand: a jittered grid on the terrace, the nearest the stage first ──
  const spots: { x: number; z: number; d: number; used: boolean }[] = [];
  // (in the stage's frame: the landing down to the bank and the ellipse behind it)
  const reach = Math.max(LAKE_SHORE.rx, LAKE_SHORE.rz) + 1;
  for (let v = Math.min(...site.bank) + 1; v <= T_UV.z + reach; v += 1.0)
    for (let u = -reach; u <= reach; u += 1.0) {
      const p = pt(u + (rnd() - 0.5) * 0.36 + (Math.round(v) % 2) * 0.5, v + (rnd() - 0.5) * 0.3);
      const jx = p.x;
      const jz = p.z;
      if (!onTerrace(jx, jz, EDGE) || inLane(jx, jz, 0)) continue;
      if (mats.some((m) => Math.hypot(jx - m.x, jz - m.z) < 2.3)) continue;
      if (stools.some((s) => Math.hypot(jx - s.x, jz - s.z) < 1.2)) continue;
      toStage(jx, jz, o);
      // (all over the terrace and its landing, the nearer the stage the denser: the order the families take them in)
      spots.push({ x: jx, z: jz, d: rnd() * (0.6 + o.z / 60 + Math.abs(o.x) / 80), used: false });
    }
  spots.sort((a, b) => a.d - b.d);
  const take = (near: { x: number; z: number } | null) => {
    let best = -1;
    let bd = Infinity;
    for (let k = 0; k < spots.length; k++) {
      const s = spots[k];
      if (s.used) continue;
      if (!near) {
        best = k;
        break;
      }
      const d = Math.hypot(s.x - near.x, s.z - near.z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    if (best < 0 || (near && bd > 2.6)) return null;
    spots[best].used = true;
    return spots[best];
  };
  while (members.length < max) {
    const lead = take(null);
    if (!lead) break;
    const g = groups.length;
    const r = rnd();
    const size = Math.min(max - members.length, r < 0.12 ? 1 : r < 0.36 ? 2 : r < 0.7 ? 3 : r < 0.92 ? 4 : 5);
    const kids = size <= 2 ? 0 : size - 2 - (size === 5 ? 1 : 0);
    const young = size <= 2;
    groups.push({ start: 0, leave: 0, v: kids ? 0.95 + 0.1 * rnd() : 1.05 + 0.12 * rnd() });
    const low = g % 2 === 0;
    const first = members.length;
    let at: { x: number; z: number } = lead;
    for (let j = 0; j < size; j++) {
      const s = j === 0 ? lead : take(at);
      if (!s) break;
      at = s;
      if (j >= size - kids) {
        const sparkler = rnd() < 0.4;
        add({ look: child(seed++, sparkler), role: 'stand', group: g, x: s.x, z: s.z, kid: true, phone: false, sparkler, low });
      } else {
        const elder = size === 5 && j === 2;
        const phone = !elder && rnd() < (young ? 0.75 : 0.5);
        const role = elder ? 'elder' : j === 1 ? 'man' : j === 0 ? 'woman' : rnd() < 0.5 ? 'man' : 'woman';
        add({ look: festive(role, seed++, phone), role: 'stand', group: g, x: s.x, z: s.z, kid: false, phone, sparkler: false, low, jumps: young && rnd() < 0.5 });
      }
    }
    const grown: number[] = [];
    for (let k = first; k < members.length; k++) if (!members[k].kid) grown.push(k);
    if (grown.length >= 2) {
      members[grown[0]].partner = grown[1];
      members[grown[1]].partner = grown[0];
    }
  }
  // ── When each family comes (the mats' first, then the nearest the stage; a few late) and goes home ──
  const G = groups.length;
  for (let g = 0; g < G; g++) {
    const gr = groups[g];
    const u = g / Math.max(1, G - 1);
    const late = g >= mats.length && rnd() < 0.12;
    const arrive = late ? -4300 + 2300 * rnd() : LAKE_COME + 240 + 1500 * u ** 1.15 + 90 * rnd();
    const c = members.find((m) => m.group === g)!.cum;
    gr.start = Math.max(LAKE_COME, arrive - c[c.length - 1] / gr.v);
    gr.leave = g < mats.length ? 540 + 420 * rnd() : 620 + (LAKE_GONE - 620 - 300) * rnd() ** 1.3;
  }
  // ── The boats: families from the floating village, moored before the stage on its village side, a lantern each ──
  const boats: LakeBoat[] = [];
  const MOOR: readonly [number, number, number][] = [
    // (u, v, how the bow turns from the stage's middle)
    // (beyond the stage's village end and the venue's boat there (nye/_lkWater.ts), where the water is open: two rows,
    // bows toward the stage)
    [-18.2, 2.6, 0.1],
    [-19.0, -1.6, 0.05],
    [-23.8, 3.0, 0.15],
    [-24.4, -1.4, 0],
    [-29.4, 0.9, 0.1],
  ];
  const LAMPS = [0xe8402a, 0xf0b040, 0xe86a8a, 0xf0d070, 0xd84a3a];
  // (the way from the floating village: north-west over the open water, then along the shore to the stage; stage frame)
  const FROM = ([
    [-72, -46],
    [-48, -16],
    [-36, -5],
  ] as const).map(([u, v]) => pt(u, v));
  const dryWay = FROM.filter((p) => !openWater(field, p.x, p.z, 0.4)).length;
  if (dryWay) console.warn(`[map] nye lake people: ${dryWay} of the boats' way points are not on open water`);
  MOOR.forEach(([u0, v0, turn], k) => {
    // (open water at the mooring, off the stage and the jetty: moved out along −v until there is)
    let p: { x: number; z: number } | null = null;
    for (let dv = 0; dv < 12; dv += 0.5) {
      const q = pt(u0 - dv * 0.6, v0 - dv * 0.8);
      if (openWater(field, q.x, q.z, 0.5) && offStage(q.x, q.z, 1.5) && !inLane(q.x, q.z, 1.8)) {
        p = q;
        break;
      }
    }
    if (!p) return;
    const sx = LAKE_STAGE.x + FX * 1;
    const sz = LAKE_STAGE.z + FZ * 1;
    const yaw = Math.atan2(sx - p.x, sz - p.z) + turn;
    const pts: number[] = [];
    for (const q of FROM) pts.push(q.x, q.z);
    // (the last stretch: in from behind the mooring, so the boat comes up bow first)
    pts.push(p.x - Math.sin(yaw) * 5, p.z - Math.cos(yaw) * 5, p.x, p.z);
    const route = new Float32Array(pts);
    const cum = lengths(route);
    const v = 0.75 + 0.1 * rnd();
    const arrive = LAKE_COME + 400 + k * 330 + 120 * rnd();
    const crew: Crew[] = [];
    const n = k === 3 ? 2 : 3;
    // (the father paddles at the stern; a mother or grandmother amidships; a child at the bow)
    crew.push({ look: festive('man', seed++, false), seat: [0, -1.25], kid: false, paddler: true });
    crew.push({ look: festive(k === 1 ? 'elder' : 'woman', seed++, k % 2 === 0), seat: [0, -0.2], kid: false, paddler: false });
    if (n === 3) crew.push({ look: child(seed++, k % 2 === 1), seat: [0, 0.75], kid: true, paddler: false });
    boats.push({ x: p.x, z: p.z, yaw, route, cum, start: arrive - cum[cum.length - 1] / v, leave: 700 + 900 * rnd(), v, crew, low: k < 3, lamp: LAMPS[k % LAMPS.length] });
  });
  // ── The lotus candles: set afloat by the two children in turn, drifting out and along the shore ──
  const candles: Candle[] = [];
  const kidsAt = members.filter((m) => m.role === 'lotus').sort((a, b) => a.lotus - b.lotus);
  if (kidsAt.length) {
    for (let n = 0; LOTUS_FROM + 30 + n * CANDLE_EVERY < LOTUS_TO; n++) {
      const m = kidsAt[n % kidsAt.length];
      const t = LOTUS_FROM + 30 + n * CANDLE_EVERY + (rnd() - 0.5) * 8;
      // (out over the water from the child's hands, then along the shore toward the village side, each its own way)
      const ox = Math.sin(m.wyaw);
      const oz = Math.cos(m.wyaw);
      const x = m.wx + ox * 1.3;
      const z = m.wz + oz * 1.3;
      const a = 0.3 + (rnd() - 0.5) * 0.3;
      const dx = ox * a - RX * (1 - a);
      const dz = oz * a - RZ * (1 - a);
      const l = Math.hypot(dx, dz) || 1;
      let far = 0;
      while (far < 30) {
        const px = x + (dx / l) * (far + 0.5);
        const pz = z + (dz / l) * (far + 0.5);
        if (!openWater(field, px, pz, 0.05) || !offStage(px, pz, 0.8)) break;
        far += 0.5;
      }
      candles.push({ x, z, dx: dx / l, dz: dz / l, t, far, v: 0.04 + 0.02 * rnd() });
    }
  }
  return { members, groups, boats, candles, mats, stools };
}

/**
 * Where a child kneels to set candles afloat on the ghat's strip `u` (−8‥8, not under the jetty): the second step
 * into the water (0.4 m over it), its top. Null if the strip has no steps.
 */
function ghatEdge(site: LakeSite, u: number): { x: number; z: number; y: number } | null {
  const k = u + 8;
  if (k < 0 || k > 16 || Math.abs(u) < 2) return null;
  const bank = site.bank[k];
  const edge = site.edge[k];
  if (bank - edge > 14) return null;
  let wet = 0;
  for (let c = bank - RUN / 2; c > edge - 6; c -= RUN) {
    if (c >= edge) continue;
    if (++wet < 2) continue;
    const y = site.stepTop(u, c);
    if (!Number.isFinite(y) || y < site.water + 0.15) return null;
    const p = pt(u, c);
    return { x: p.x, z: p.z, y };
  }
  return null;
}

/**
 * Where a member is `d` m along their route (x, z, facing): their lane beside the family's lead on the trail, single
 * file onto the terrace and to their place. No allocation.
 */
export function alongLake(m: LakeMember, d: number, out: { x: number; z: number; yaw: number }): void {
  alongRoute(m.route, m.cum, d, out);
  const n = m.cum.length;
  const fade = Math.min(1, d / 4, Math.max(0, (m.trail - 3 - d) / 6));
  if (fade <= 0 || n < 2) return;
  const side = m.side * 0.55 * fade;
  out.x -= Math.cos(out.yaw) * side;
  out.z += Math.sin(out.yaw) * side;
}

/** A point `d` m along a route (x, z pairs, lengths `cum`): x, z, the heading there. */
export function alongRoute(r: Float32Array, c: Float32Array, d: number, out: { x: number; z: number; yaw: number }): void {
  const n = c.length;
  d = Math.max(0, Math.min(c[n - 1], d));
  let k = 1;
  while (k < n - 1 && c[k] < d) k++;
  const seg = c[k] - c[k - 1] || 1;
  const t = (d - c[k - 1]) / seg;
  const ax = r[2 * k - 2];
  const az = r[2 * k - 1];
  const dx = r[2 * k] - ax;
  const dz = r[2 * k + 1] - az;
  out.x = ax + dx * t;
  out.z = az + dz * t;
  out.yaw = Math.atan2(dx, dz);
}

// ── Their things (rig space: feet on y = 0, +z ahead) ──

const TEAK = 0x8f532b;
const TEAK_DARK = 0x6e3f20;
const CAP = 0xc08652;
const PLANK = 0x5c3419;

/** The lantern's box in `familyBoatDef` (its paper glows at night). */
export const BOAT_LAMP = 15;

/**
 * A family's boat from the floating village (true size: placed at the people's scale as the fishermen's): a teak
 * dugout, a green band under the gunwale, two thwarts, a mat amidships, a paddle along the side, and a paper lantern
 * on a bamboo pole at the bow (`BOAT_LAMP`).
 */
export function familyBoatDef(lamp: number): RigDef {
  const d = new RigDef();
  d.box([0, -0.11, 0], [0.62, 0.12, 3.5], TEAK_DARK)
    .box([0, -0.07, 0], [0.7, 0.04, 3.1], PLANK)
    .box([0.4, 0.08, 0], [0.09, 0.32, 3.2], TEAK)
    .box([-0.4, 0.08, 0], [0.09, 0.32, 3.2], TEAK)
    .box([0.415, 0.255, 0], [0.13, 0.04, 3.2], CAP)
    .box([-0.415, 0.255, 0], [0.13, 0.04, 3.2], CAP)
    .box([0.452, 0.17, 0], [0.012, 0.06, 3.1], 0x3a8a5a)
    .box([-0.452, 0.17, 0], [0.012, 0.06, 3.1], 0x3a8a5a)
    .box([0, 0.12, 1.76], [0.44, 0.38, 0.36], TEAK)
    .box([0, 0.42, 2.0], [0.14, 0.34, 0.2], CAP)
    .box([0, 0.1, -1.76], [0.44, 0.32, 0.34], TEAK)
    .box([0, 0.3, -1.96], [0.12, 0.2, 0.16], CAP)
    .box([0, 0.14, -0.75], [0.76, 0.05, 0.2], CAP)
    .box([0, -0.035, 0.1], [0.56, 0.02, 0.9], 0xb8342c)
    // The lantern's pole at the bow, and its paper (glows at night: box 15), a cap.
    .box([0.24, 0.62, 1.45], [0.04, 1.24, 0.04], 0xb8a060)
    .box([0.24, 1.12, 1.45], [0.2, 0.24, 0.2], lamp, { glow: 1 })
    .box([0.24, 1.26, 1.45], [0.12, 0.04, 0.12], 0x2a2a2a)
    // A paddle along the side.
    .box([-0.26, 0.02, -0.4], [0.05, 0.05, 1.9], TEAK_DARK)
    .box([-0.26, 0.02, 0.6], [0.15, 0.03, 0.38], TEAK_DARK);
  return d;
}

/** A lotus candle (true size): a leaf, the pink petals, the flame (glows). */
export function candleDef(): RigDef {
  return new RigDef()
    .box([0, 0.01, 0], [0.34, 0.03, 0.34], 0x3a7a3a, { rot: [0, 0.4, 0] })
    .box([0, 0.06, 0], [0.22, 0.09, 0.22], 0xf2a8c0)
    .box([0, 0.06, 0], [0.22, 0.09, 0.22], 0xe888a8, { rot: [0, Math.PI / 4, 0] })
    .box([0, 0.14, 0], [0.05, 0.08, 0.05], 0xffc870, { glow: 1.6 });
}

/** A low Khmer stool (the person's model metres: placed at their scale). */
export function stoolDef(): RigDef {
  return new RigDef().box([0, FIT.stool / 2, 0.02], [0.3, FIT.stool, 0.26], 0x8a5a3a);
}

/**
 * The mahori ensemble's mat on the stage (rig space: its middle, the players face +z): a roneat ek on its boat-shaped
 * foot, a khim (the hammered dulcimer: a flat trapezoid box on short legs, its strings and bridges) and the tro's
 * small sound box with its long neck (the two-string fiddle, held upright on the knee: the player sits beside it).
 */
export function mahoriDef(): RigDef {
  const d = new RigDef();
  d.box([0, 0.015, 0], [3.0, 0.03, 1.9], 0x2a4a8a).box([0, 0.02, 0], [2.8, 0.03, 1.7], 0xd8b060);
  // Roneat ek before the left player.
  const rx = -1.0;
  d.box([rx, 0.1, 0.55], [0.2, 0.18, 0.28], 0x5a3420)
    .box([rx, 0.27, 0.55], [1.15, 0.16, 0.4], 0x7a4424)
    .box([rx - 0.55, 0.38, 0.55], [0.12, 0.12, 0.38], 0x7a4424)
    .box([rx + 0.55, 0.38, 0.55], [0.12, 0.12, 0.38], 0x7a4424);
  for (let k = 0; k < 6; k++) d.box([rx - 0.42 + k * 0.17, 0.36, 0.55], [0.12, 0.03, 0.32], k % 2 ? 0x3a2418 : 0x6a4428);
  // Khim before the middle player.
  d.box([0.1, 0.08, 0.55], [0.06, 0.16, 0.06], 0x3a2418)
    .box([0.1, 0.2, 0.55], [0.8, 0.08, 0.42], 0x6a3a22)
    .box([0.1, 0.25, 0.55], [0.74, 0.012, 0.36], 0xd8c890);
  for (const x of [-0.12, 0.3]) d.box([x, 0.27, 0.55], [0.03, 0.03, 0.36], 0xe8e0c8);
  // The tro, upright by the right player's knee: its sound box and neck, the bow.
  d.box([1.05, 0.12, 0.42], [0.14, 0.14, 0.14], 0x5a3020)
    .box([1.05, 0.55, 0.42], [0.03, 0.75, 0.03], 0x3a2418)
    .box([1.05, 0.92, 0.42], [0.08, 0.05, 0.05], 0x3a2418)
    .box([0.92, 0.4, 0.5], [0.35, 0.012, 0.012], 0xc8b080, { rot: [0, 0, -0.25] });
  return d;
}

/** A fisherman's net heaped before him as he mends it (true size). */
export function netHeapDef(): RigDef {
  return new RigDef()
    .box([0, 0.06, 0], [0.7, 0.12, 0.55], 0x6a7a6a)
    .box([0.12, 0.13, -0.05], [0.4, 0.08, 0.36], 0x7a8a78, { rot: [0, 0.5, 0] })
    .box([-0.3, 0.03, 0.2], [0.25, 0.06, 0.2], 0x9a9a90);
}
