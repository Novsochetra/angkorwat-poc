import { mulberry32 } from '../../voxel/random';
import { folk } from '../festival/_folk';
import type { HeightField } from '../heightfield';
import { BOARD, GATE, GROUND, LANTERN_WALK, NAGA, onSquare, RING, SQUARE, STAGE, STALLS } from '../nye/plan';
import type { WalkMap } from '../roam/walkmap';
import { dress } from './_kinds';
import { CARRY, FEAT, SLOT, type Look } from './_personModel';
import { Ground } from './_routes';
import { RigDef } from './_things';

/**
 * The New Year's Eve crowd's plan (people/_sceneNye.ts): who comes, in which family, where each stands or sits on
 * the festival square (nye/plan.ts), when they come up the lantern walk and when they go home. Made once, seeded:
 * the same crowd every time. No three.js but the rigs' definitions.
 *
 * The floor's rules (the square's own pieces are built by nye/square.ts and stage.ts at the same time, so the crowd
 * keeps a margin round where they stand): nobody stands on the gathering ring (`RING` + 1.5 m) or in the aisle from
 * the gate to the stage's stairs (`AISLE` m each side of x = `AISLE_X`), within `STALL_CLEAR` m of a stall's middle,
 * `NAGA_CLEAR` of a naga, within `EDGE` m of the square's edge (its trees, banner poles and lamps), in front of the
 * stage's front (`FRONT`) or near the gate (`BACK`).
 */

/**
 * The square's paving stands this far over the land (nye/_sqFloor.ts `TOP`); it is kept out of the walk map, so the
 * crowd's floor (`SquareGround`) adds it on the square.
 */
export const PAVING = 0.08;
/** The square's floor (m). */
export const FLOOR = GROUND + PAVING;

/** The people's floor (`_routes.ts` `Ground`), on the square its paving's top. */
export class SquareGround extends Ground {
  constructor(field: HeightField, walk: WalkMap | null) {
    super(field, walk);
  }

  override at(x: number, z: number, y: number): number {
    const g = super.at(x, z, y);
    return Number.isFinite(g) && onSquare(x, z) ? g + PAVING : g;
  }
}
/** The stage's top (people on it are placed there: it is not in the walk map). */
export const STAGE_TOP = GROUND + STAGE.h;
/** Where the crowd looks before midnight: the board's middle. */
export const BOARD_AT = { x: BOARD.x, y: GROUND + BOARD.y, z: BOARD.z } as const;
/** The way in through the gate: outside it, its opening, just inside. */
export const GATE_OUT = { x: GATE.x, z: GATE.z + 4.5 } as const;
export const GATE_IN = { x: GATE.x, z: GATE.z - 4 } as const;

const AISLE_X = (GATE.x + STAGE.x) / 2;
const AISLE = 1.9;
const RING_CLEAR = RING.r + 1.6;
const STALL_CLEAR = 3.6;
const NAGA_CLEAR = 2.6;
const EDGE = 3.2;
const FRONT = STAGE.stairTo + 0.8;
const BACK = GATE.z - 5.5;

/** The square's lotus pots (nye/_sqDecor.ts `POTS`: by the gate inside, along the way, at the stage's stairs): kept clear. */
const POTS: readonly [number, number][] = [
  [GATE.x - 4.4, GATE.z - 4.6],
  [GATE.x + 4.4, GATE.z - 4.6],
  [GATE.x - 3.8, GATE.z - 10.5],
  [GATE.x + 3.8, GATE.z - 10.5],
  [STAGE.x - 10, STAGE.stairTo + 2.2],
  [STAGE.x + 10, STAGE.stairTo + 2.2],
];

/** Seated families' mats at the square's sides (middle, size along x and z). */
export const MATS: readonly { x: number; z: number; w: number; d: number }[] = [
  { x: SQUARE.x - 14.6, z: SQUARE.z - 0.5, w: 2.2, d: 2.8 },
  { x: SQUARE.x + 14.6, z: SQUARE.z - 0.5, w: 2.2, d: 2.8 },
  { x: SQUARE.x - 12.2, z: SQUARE.z + 13, w: 2.8, d: 2.2 },
  { x: SQUARE.x + 12.4, z: SQUARE.z + 13, w: 2.8, d: 2.2 },
];

/** Two monks watching quietly at the west side, near the stage (not in the crowd's middle). */
export const MONKS: readonly [number, number][] = [
  [SQUARE.x - 12, STAGE.front + 9],
  [SQUARE.x - 11.4, STAGE.front + 10.4],
];

/** Is (x, z) a place to stand in the crowd? */
export function standable(x: number, z: number): boolean {
  const ex = (x - SQUARE.x) / (SQUARE.rx - EDGE);
  const ez = (z - SQUARE.z) / (SQUARE.rz - EDGE);
  if (ex * ex + ez * ez > 1) return false;
  if (z < FRONT || z > BACK) return false;
  if (Math.abs(x - AISLE_X) < AISLE) return false;
  if (Math.hypot(x - RING.x, z - RING.z) < RING_CLEAR) return false;
  for (const s of STALLS) if (Math.hypot(x - s.x, z - s.z) < STALL_CLEAR) return false;
  for (const n of NAGA) if (Math.hypot(x - n.x, z - n.z) < NAGA_CLEAR) return false;
  for (const m of MATS) if (Math.abs(x - m.x) < m.w / 2 + 1.4 && Math.abs(z - m.z) < m.d / 2 + 1.4) return false;
  for (const [mx, mz] of MONKS) if (Math.hypot(x - mx, z - mz) < 1.3) return false;
  for (const [px, pz] of POTS) if (Math.hypot(x - px, z - pz) < 1.4) return false;
  return true;
}

export type Role =
  /** Stands in the crowd. */
  | 'stand'
  /** Sits on a family's mat. */
  | 'sit'
  /** A child on a father's shoulders (no place of their own: rides on `carrier`). */
  | 'shoulder'
  /** A monk watching quietly at the side (stands, looks; never cheers). */
  | 'monk';

export interface Member {
  look: Look;
  role: Role;
  /** Their family (index into `NyeCrowdPlan.groups`). */
  group: number;
  /** Their place on the square and their facing there (toward the board). */
  x: number;
  z: number;
  yaw: number;
  /** A child; holds a phone (the photo pose shows it); holds a sparkler (a kid's torch, its flame bright gold-white). */
  kid: boolean;
  phone: boolean;
  sparkler: boolean;
  /** Jumps for joy at midnight (children, the young). */
  jumps: boolean;
  /** `shoulder`: the member they ride on. */
  carrier: number;
  /** A partner to turn to at midnight (-1: none). */
  partner: number;
  /** How far behind the family's lead they walk (m), and to the side (−1‥1, a lane's half width). */
  lag: number;
  side: number;
  /** Their way from the village down the lantern walk, through the gate to their place (x, z pairs) and its lengths. */
  route: Float32Array;
  cum: Float32Array;
  /** Shown on the low graphics level too. */
  low: boolean;
}

export interface Group {
  /** When they set out from the village end of the lantern walk, and leave their place for home (s from midnight). */
  start: number;
  leave: number;
  /** Walking pace (m/s). */
  v: number;
}

export interface NyeCrowdPlan {
  members: Member[];
  groups: Group[];
}

/** The time the night's crowd starts coming (s from midnight: 22:20, before the hold), and the last leaves (00:40). */
export const COME_FROM = -6000;
export const ALL_GONE = 2400;

/** Lengths along a route (x, z pairs). */
function lengths(r: Float32Array): Float32Array {
  const n = r.length / 2;
  const c = new Float32Array(n);
  for (let k = 1; k < n; k++) c[k] = c[k - 1] + Math.hypot(r[2 * k] - r[2 * k - 2], r[2 * k + 1] - r[2 * k - 1]);
  return c;
}

/** A route from the lantern walk's village end, through the gate, to (x, z). */
function routeTo(x: number, z: number): Float32Array {
  const pts: number[] = [];
  for (const [px, pz] of LANTERN_WALK) pts.push(px, pz);
  pts.push(GATE_OUT.x, GATE_OUT.z, GATE.x, GATE.z, GATE_IN.x, GATE_IN.z, x, z);
  return new Float32Array(pts);
}

/** The crowd's people dressed for the night: folk in their best (`festival/_folk.ts`), named for the nature book. */
function festive(role: 'woman' | 'man' | 'elder', seed: number, phone: boolean): Look {
  const l = folk(role, seed, phone ? { props: [FEAT.phone] } : {});
  if (phone) l.carry = CARRY.phone;
  l.kind = 'festival';
  return l;
}

function child(seed: number, sparkler: boolean): Look {
  const l = folk('kid', seed, sparkler ? { carry: CARRY.torch, props: [FEAT.torch] } : {});
  if (sparkler) {
    // (a sparkler: a thin grey wire, its tip burning white-gold)
    l.carry = CARRY.torch;
    l.colors[SLOT.flame] = 0xffd890;
    l.colors[SLOT.wood] = 0x8a8a86;
  }
  return l;
}

/**
 * The night's crowd: `max` people at most (families of one to five; four seated families on the mats; two monks at
 * the west side), the families nearest the stage coming first.
 */
export function planCrowd(max: number): NyeCrowdPlan {
  // (no room for the seated families and the monks: nobody)
  if (max < 4 * MATS.length + MONKS.length) return { members: [], groups: [] };
  const rnd = mulberry32(0x2027);
  // Places to stand: a jittered grid, by distance to the stage's stairs (the nearest fill first).
  const spots: { x: number; z: number; d: number; used: boolean }[] = [];
  for (let z = FRONT; z <= BACK; z += 0.98)
    for (let x = SQUARE.x - SQUARE.rx; x <= SQUARE.x + SQUARE.rx; x += 0.98) {
      const jx = x + (rnd() - 0.5) * 0.36 + (Math.round(z) % 2) * 0.45;
      const jz = z + (rnd() - 0.5) * 0.3;
      if (!standable(jx, jz)) continue;
      // (in front of the stage first, then round the ring's sides; the back last)
      const d = Math.hypot(jx - STAGE.x, (jz - STAGE.front) * 0.8);
      spots.push({ x: jx, z: jz, d, used: false });
    }
  spots.sort((a, b) => a.d - b.d);
  const members: Member[] = [];
  const groups: Group[] = [];
  const faceBoard = (x: number, z: number) => Math.atan2(BOARD.x - x, BOARD.z - z);
  const add = (m: Omit<Member, 'route' | 'cum' | 'yaw' | 'carrier' | 'partner' | 'lag' | 'side' | 'jumps'> & Partial<Member>): number => {
    const route = routeTo(m.x, m.z);
    const k = members.filter((o) => o.group === m.group).length;
    members.push({
      yaw: faceBoard(m.x, m.z),
      carrier: -1,
      partner: -1,
      jumps: m.kid,
      lag: k * 1.1,
      side: k % 2 ? -0.9 : 0.9,
      ...m,
      route,
      cum: lengths(route),
    });
    return members.length - 1;
  };
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
  let seed = 9100;
  // The seated families on the mats (grandparents, a mother, children), and the two monks: among the first.
  const seated: number[] = [];
  MATS.forEach((m, k) => {
    const g = groups.length;
    seated.push(g);
    groups.push({ start: 0, leave: 0, v: 0.85 });
    const across = m.w > m.d;
    for (let j = 0; j < 4; j++) {
      const u = (j % 2) - 0.5;
      const w = Math.floor(j / 2) - 0.5;
      const x = m.x + (across ? u * 1.3 : w * 1.0);
      const z = m.z + (across ? w * 1.0 : u * 1.3);
      const kid = j >= 2;
      const look = kid ? child(seed++, false) : festive(j === 0 ? 'elder' : 'woman', seed++, j === 1);
      add({ look, role: 'sit', group: g, x, z, kid, phone: j === 1, sparkler: false, low: k < 2 });
    }
  });
  {
    const g = groups.length;
    groups.push({ start: 0, leave: 0, v: 0.8 });
    MONKS.forEach(([x, z], k) => add({ look: dress('monk', seed++, { age: k === 0 ? 'old' : undefined }), role: 'monk', group: g, x, z, kid: false, phone: false, sparkler: false, low: true, jumps: false }));
  }
  // The standing families, the nearest the stage first.
  while (members.length < max) {
    const lead = take(null);
    if (!lead) break;
    const g = groups.length;
    const r = rnd();
    const size = Math.min(max - members.length, r < 0.12 ? 1 : r < 0.36 ? 2 : r < 0.68 ? 3 : r < 0.9 ? 4 : 5);
    const kids = size <= 2 ? 0 : size - 2 - (size === 5 ? 1 : 0);
    const young = size <= 2;
    groups.push({ start: 0, leave: 0, v: kids ? 0.95 + 0.1 * rnd() : 1.05 + 0.12 * rnd() });
    const low = g % 2 === 0;
    // (the parents, or two friends, or one alone; a grandparent in a family of five)
    const first = members.length;
    const at: { x: number; z: number }[] = [lead];
    for (let j = 0; j < size; j++) {
      const isKid = j >= size - kids;
      // (a family's youngest on the father's shoulders, now and then: no place of its own)
      if (isKid && j === size - 1 && kids >= 1 && rnd() < 0.4) {
        add({ look: child(seed++, false), role: 'shoulder', group: g, x: at[0].x, z: at[0].z, kid: true, phone: false, sparkler: false, low, carrier: first + 1, jumps: false });
        continue;
      }
      const s = j === 0 ? lead : take(at[at.length - 1]);
      if (!s) break;
      at.push(s);
      if (isKid) {
        const sparkler = rnd() < 0.35;
        add({ look: child(seed++, sparkler), role: 'stand', group: g, x: s.x, z: s.z, kid: true, phone: false, sparkler, low });
      } else {
        const elder = size === 5 && j === 2;
        const phone = !elder && rnd() < (young ? 0.75 : 0.5);
        const role = elder ? 'elder' : j === 1 ? 'man' : j === 0 ? 'woman' : rnd() < 0.5 ? 'man' : 'woman';
        add({ look: festive(role, seed++, phone), role: 'stand', group: g, x: s.x, z: s.z, kid: false, phone, sparkler: false, low, jumps: young && rnd() < 0.5 });
      }
    }
    // (two grown-ups together turn to each other at midnight)
    const grown = members.slice(first).map((m, k) => (m.kid ? -1 : first + k)).filter((k) => k >= 0);
    if (grown.length >= 2) {
      members[grown[0]].partner = grown[1];
      members[grown[1]].partner = grown[0];
    }
    // (a shoulder child's carrier: the family's man if standing, else none)
    for (let k = first; k < members.length; k++) {
      const m = members[k];
      if (m.role !== 'shoulder') continue;
      const c = members[m.carrier];
      if (!c || c.group !== g || c.role !== 'stand' || c.kid) m.carrier = grown[0] ?? -1;
      if (m.carrier < 0) m.role = 'stand';
    }
  }
  // When each family comes (the first groups — the seated families, the monks, those nearest the stage — first, from
  // 22:20 through the first half hour of the hold; a few late, until 23:30), and goes home after the show (from 00:08,
  // the last by 00:40). Seated families with grandparents go early.
  const G = groups.length;
  for (let g = 0; g < G; g++) {
    const gr = groups[g];
    const u = g / Math.max(1, G - 1);
    const late = rnd() < 0.1;
    const arrive = late ? -4400 + 2600 * rnd() : COME_FROM + 260 + 1500 * u ** 1.15 + 90 * rnd();
    // (setting out so they reach the gate then: the walk's length at their pace)
    const c = members.find((m) => m.group === g)!.cum;
    const len = c[c.length - 1];
    gr.start = arrive - len / gr.v;
    const seatedFamily = seated.includes(g);
    gr.leave = seatedFamily ? 520 + 400 * rnd() : 600 + (ALL_GONE - 600 - 260) * rnd() ** 1.3;
  }
  // (nobody sets out before the crowd starts coming)
  for (const gr of groups) gr.start = Math.max(COME_FROM, gr.start);
  return { members, groups };
}

/**
 * Where a member is `d` m along their route (out: x, z, the way they face there). With their lane to the side (fading
 * in after the start, out before the end) and no allocation.
 */
export function along(m: Member, d: number, out: { x: number; z: number; yaw: number }): void {
  const r = m.route;
  const c = m.cum;
  const n = c.length;
  const L = c[n - 1];
  d = Math.max(0, Math.min(L, d));
  let k = 1;
  while (k < n - 1 && c[k] < d) k++;
  const seg = c[k] - c[k - 1] || 1;
  const t = (d - c[k - 1]) / seg;
  const ax = r[2 * k - 2];
  const az = r[2 * k - 1];
  const dx = r[2 * k] - ax;
  const dz = r[2 * k + 1] - az;
  const l = Math.hypot(dx, dz) || 1;
  // (the lane: beside the lead, but single file through the gate and on to their place)
  const fade = Math.min(1, d / 4, Math.max(0, (c[LANTERN_WALK.length] - 3 - d) / 6));
  const side = m.side * 0.55 * fade;
  out.x = ax + dx * t - (dz / l) * side;
  out.z = az + dz * t + (dx / l) * side;
  out.yaw = Math.atan2(dx, dz);
}

/** A family's woven mat (rig space: its middle). */
export function matDef(w: number, d: number, seed: number): RigDef {
  const c = [0xb8342c, 0x2a6a8a, 0x8a4aa0, 0xc88a2a][seed % 4];
  return new RigDef().box([0, 0.015, 0], [w, 0.03, d], 0xd8b060).box([0, 0.022, 0], [w - 0.24, 0.03, d - 0.24], c);
}

/**
 * The pinpeat ensemble on the stage, on its mat (rig space: the mat's middle; the players face +x): a roneat ek (the
 * boat-shaped xylophone on its foot), a pair of skor thom drums on their stand, the sralai's pipe before its player's
 * face (he sits palms together as he holds it), small chhing cymbals on a cushion.
 */
export function ensembleDef(): RigDef {
  const d = new RigDef();
  d.box([0, 0.015, 0], [2.6, 0.03, 2.6], 0xb8342c).box([0, 0.02, 0], [2.4, 0.03, 2.4], 0xd8b060);
  // Roneat ek before the front-left player.
  const rz = -0.6;
  d.box([1.15, 0.1, rz], [0.28, 0.18, 0.2], 0x5a3420)
    .box([1.15, 0.27, rz], [0.4, 0.16, 1.15], 0x7a4424)
    .box([1.15, 0.38, rz - 0.55], [0.38, 0.12, 0.12], 0x7a4424)
    .box([1.15, 0.38, rz + 0.55], [0.38, 0.12, 0.12], 0x7a4424);
  for (let k = 0; k < 6; k++) d.box([1.15, 0.36, rz - 0.42 + k * 0.17], [0.32, 0.03, 0.12], k % 2 ? 0x3a2418 : 0x6a4428);
  // Skor thom: two barrel drums tilted on a stand, before the front-right player.
  const sz = 0.7;
  d.box([1.1, 0.12, sz], [0.46, 0.2, 0.9], 0x4a2c1c);
  for (const z of [sz - 0.24, sz + 0.24])
    d.box([1.12, 0.36, z], [0.4, 0.4, 0.4], 0x6a2a1e, { rot: [0, 0, 0.35] }).box([1.27, 0.43, z], [0.05, 0.36, 0.36], 0xe0d0b0, { rot: [0, 0, 0.35] });
  // The sralai's pipe, from the back-left player's hands up to his lips (he sits as `chant`), its bell low.
  d.box([-0.36, 0.86, -0.6], [0.035, 0.36, 0.035], 0x3a2418, { rot: [0, 0, 0.6] }).box([-0.27, 0.72, -0.6], [0.07, 0.06, 0.07], 0xc89a40, { rot: [0, 0, 0.6] });
  // Chhing on a cushion by the back-right player.
  d.box([-0.15, 0.04, 0.95], [0.3, 0.06, 0.24], 0xa8342c).box([-0.15, 0.08, 0.95], [0.12, 0.03, 0.12], 0xd8b048);
  return d;
}
