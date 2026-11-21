import { mulberry32 } from '../../voxel/random';
import { folk } from '../festival/_folk';
import type { HeightField } from '../heightfield';
import { BENCHES, BOARD, FIRES, GATE, GROUND, LANTERN_WALK, NAGA, onSquare, RING, SALA, SEAT_H, STAGE, STALL_K, STALLS, TABLES, tableStools } from '../nye/plan';
import type { WalkMap } from '../roam/walkmap';
import { dress } from './_kinds';
import { CARRY, FEAT, FIT, PEOPLE_SCALE, SLOT, type Look } from './_personModel';
import { Ground } from './_routes';
import { RigDef } from './_things';

/**
 * The New Year's Eve crowd's plan (people/_sceneNye.ts): who comes, in which group, what they do and where on the
 * festival square (nye/plan.ts), when they come up the lantern walk and when they go home. Made once, seeded: the same
 * crowd every time. No three.js but the rigs' definitions.
 *
 * Not one block before the stage but small groups of two to six spread over the whole square, as at a Cambodian night
 * fair (the owner's reference): families watching the dance in loose knots before the stage (a child on a father's
 * shoulders now and then), families eating at the low tables by the food stalls, grandparents, mothers and children
 * on woven mats, elders on the benches, friends chatting in circles, couples taking selfies with the board and the lit
 * trees behind them, children chasing each other round the fire bowls with sparklers, buyers queuing at every stall,
 * couples and friends strolling from stall to stall, three monks watching from the sala.
 *
 * The floor's rules (the square's own pieces are built by nye/square.ts and stage.ts at the same time, so the crowd
 * keeps a margin round where they stand): every group's spot is set by hand off the gathering ring (`RING` +
 * `RING_CLEAR`) and the aisle from the gate to the stage's stairs (x 381.6‥385.4), with the ways between left open;
 * arrivals and strollers walk round the stalls, tables, benches, fire bowls and mats (`OBSTACLES`), not through them.
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
/** The way in through the gate: outside it, its opening, just inside, a few steps up the aisle. */
export const GATE_OUT = { x: GATE.x, z: GATE.z + 4.5 } as const;
export const GATE_IN = { x: GATE.x, z: GATE.z - 4 } as const;
const AISLE_IN = { x: GATE.x, z: GATE.z - 9 } as const;

const RING_CLEAR = RING.r + 1.6;

/** Seated families' mats (middle, size along x and z): drawn by the people part while the family sits there. */
export const MATS: readonly { x: number; z: number; w: number; d: number }[] = [
  { x: 367, z: -255.6, w: 2.8, d: 2.2 },
  { x: 400.2, z: -256.2, w: 2.8, d: 2.2 },
  { x: 363.6, z: -249.6, w: 2.2, d: 2.6 },
  { x: 402.4, z: -250.4, w: 2.2, d: 2.6 },
];

/** The square's lotus pots (nye/_sqDecor.ts `POTS`: by the gate inside, along the way, at the stage's stairs). */
const POTS: readonly [number, number][] = [
  [GATE.x - 4.4, GATE.z - 4.6],
  [GATE.x + 4.4, GATE.z - 4.6],
  [GATE.x - 3.8, GATE.z - 10.5],
  [GATE.x + 3.8, GATE.z - 10.5],
  [STAGE.x - 10, STAGE.stairTo + 2.2],
  [STAGE.x + 10, STAGE.stairTo + 2.2],
];

/** What walkers go round (x, z, radius m): the stalls, the cart, tables with their stools, benches, fire bowls, mats, pots, the naga. */
const OBSTACLES: readonly [number, number, number][] = [
  ...STALLS.map((s): [number, number, number] => [s.x, s.z, (s.kind === 'cane' ? 1.5 : 2.0) * STALL_K]),
  ...TABLES.map((t): [number, number, number] => [t.x, t.z, 1.55]),
  ...BENCHES.flatMap((b): [number, number, number][] => [-0.7, 0, 0.7].map((u) => [b.x + Math.cos(b.facing) * u, b.z - Math.sin(b.facing) * u, 0.55])),
  ...FIRES.map((f): [number, number, number] => [f.x, f.z, 0.8]),
  ...MATS.map((m): [number, number, number] => [m.x, m.z, Math.max(m.w, m.d) / 2 + 0.2]),
  ...POTS.map(([x, z]): [number, number, number] => [x, z, 0.6]),
  ...NAGA.map((n): [number, number, number] => [n.x, n.z, 1.6]),
];

/** Does the walk from a to b keep off everything but what is within `skip` m of b (its own seat)? */
function clear(ax: number, az: number, bx: number, bz: number, skip = 0): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  for (const [ox, oz, r] of OBSTACLES) {
    if (skip > 0 && Math.hypot(ox - bx, oz - bz) < skip + r) continue;
    const t = Math.max(0, Math.min(1, ((ox - ax) * dx + (oz - az) * dz) / l2));
    if (Math.hypot(ax + dx * t - ox, az + dz * t - oz) < r + 0.25) return false;
  }
  return true;
}

/** A way from a to b round what is in it: straight, or by a point on a circle round the ring (x, z pairs after a). */
function way(ax: number, az: number, bx: number, bz: number, skip = 0): number[] {
  if (clear(ax, az, bx, bz, skip)) return [bx, bz];
  const aim = Math.atan2(bz - RING.z, bx - RING.x);
  for (const r of [RING_CLEAR + 1.2, RING_CLEAR + 3.4, RING.r - 2])
    for (const da of [0, 0.2, -0.2, 0.4, -0.4, 0.65, -0.65]) {
      const hx = RING.x + Math.cos(aim + da) * r;
      const hz = RING.z + Math.sin(aim + da) * r;
      if (clear(ax, az, hx, hz) && clear(hx, hz, bx, bz, skip)) return [hx, hz, bx, bz];
    }
  return [bx, bz];
}

/** What a group does on the square. */
export type Act = 'watch' | 'table' | 'mat' | 'bench' | 'circle' | 'selfie' | 'chase' | 'queue' | 'stroll' | 'monk';

export type Role =
  /** Stands (watching, talking, queuing, posing). */
  | 'stand'
  /** Sits on the ground (a family's mat; a monk on the sala's floor). */
  | 'sit'
  /** Sits on a stool or a bench (placed at its height: `lift`). */
  | 'seat'
  /** A child on a father's shoulders (no place of their own: rides on `carrier`). */
  | 'shoulder'
  /** Runs round a fire bowl (a child). */
  | 'run'
  /** Walks from stall to stall (`visits`). */
  | 'stroll';

export interface Member {
  look: Look;
  /** At a table: the same look with a bowl and chopsticks, worn while seated there. */
  eatLook: Look | null;
  role: Role;
  act: Act;
  /** Their group (index into `NyeCrowdPlan.groups`) and their place in it. */
  group: number;
  idx: number;
  /** Their place and their facing there (feet; seated: as the seat pose has them). */
  x: number;
  z: number;
  yaw: number;
  /** Seated on a stool or a bench: their feet this far over the floor; on the sala's floor: −1 (the scene finds it). */
  lift: number;
  /** The last metres from where their route ends to their place, placed rather than walked (onto a seat; 0: walked). */
  settle: number;
  /** What they turn to: the circle's or the mat's middle, the table, the fire bowl, the stall. */
  cx: number;
  cz: number;
  /** A child; holds a phone; holds a sparkler (a kid's torch, its flame bright gold-white). */
  kid: boolean;
  phone: boolean;
  sparkler: boolean;
  /** Takes the group's selfie (1: the arm up with the phone) or poses in it (2: the peace sign); else 0. */
  selfie: number;
  /** Jumps for joy at midnight (children, the young). */
  jumps: boolean;
  /** `shoulder`: the member they ride on. */
  carrier: number;
  /** A partner to turn to at midnight (-1: none). */
  partner: number;
  /** How far behind the group's lead they walk (m), and to the side (−1‥1, a lane's half width). */
  lag: number;
  side: number;
  /** Their way from the village down the lantern walk, through the gate to their place (x, z pairs) and its lengths. */
  route: Float32Array;
  cum: Float32Array;
  /** `stroll`: their round from their place (x, z, stay s, facing; the last back at their place). */
  visits: Float32Array | null;
  /** Shown on the low graphics level too. */
  low: boolean;
}

export interface Group {
  /** When they set out from the village end of the lantern walk, and leave their place for home (s from midnight). */
  start: number;
  leave: number;
  /** Walking pace (m/s). */
  v: number;
  act: Act;
}

export interface NyeCrowdPlan {
  members: Member[];
  groups: Group[];
  /** Each mat's group (−1: none came). */
  mats: number[];
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

/** A route from the lantern walk's village end, through the gate, round what is in the way, to (x, z). */
function routeTo(x: number, z: number, skip: number): Float32Array {
  const pts: number[] = [];
  for (const [px, pz] of LANTERN_WALK) pts.push(px, pz);
  pts.push(GATE_OUT.x, GATE_OUT.z, GATE.x, GATE.z, GATE_IN.x, GATE_IN.z);
  if (clear(GATE_IN.x, GATE_IN.z, x, z, skip)) pts.push(x, z);
  else pts.push(AISLE_IN.x, AISLE_IN.z, ...way(AISLE_IN.x, AISLE_IN.z, x, z, skip));
  return new Float32Array(pts);
}

/** The sala's monks come up from the back trail south of it (the sala's path) to the foot of its steps. */
function salaRoute(x: number, z: number): Float32Array {
  const sx = SALA.x + SALA.w / 2 + 1.9;
  return new Float32Array([sx + 6, SALA.z + 42, sx + 4, SALA.z + 26, sx + 2.5, SALA.z + 14, sx + 1.2, SALA.z + 4, sx, SALA.z + 0.4, x, z]);
}

/** The crowd's people dressed for the night: folk in their best (`festival/_folk.ts`), named for the nature book. */
function festive(role: 'woman' | 'man' | 'elder', seed: number, o: { phone?: boolean; peace?: boolean } = {}): Look {
  const props = [...(o.phone ? [FEAT.phone] : []), ...(o.peace ? [FEAT.vee, FEAT.grin] : [])];
  const l = folk(role, seed, props.length ? { props } : {});
  if (o.phone) l.carry = CARRY.phone;
  if (o.peace) l.carry = CARRY.peace;
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

/** The same look eating: a small bowl in the left hand, chopsticks in the right (`POSE.eat`). */
function eating(l: Look): Look {
  const e = { ...l, feats: [...l.feats.filter((f) => f !== FEAT.phone), FEAT.smallBowl], colors: l.colors.slice(), carry: CARRY.none };
  e.colors[SLOT.prop] = [0xe8d8b0, 0xd8a040, 0xc8843a][Math.floor(l.seed * 3) % 3];
  return e;
}

/** Where someone seated on a seat at (x, z) facing `yaw` stands (the seat pose's feet), and how high: `FIT.stool`. */
function seated(look: Look, x: number, z: number, yaw: number): { x: number; z: number; lift: number } {
  const k = PEOPLE_SCALE * look.height;
  const ahead = 0.26 * k;
  return { x: x + Math.sin(yaw) * ahead, z: z + Math.cos(yaw) * ahead, lift: Math.max(0, SEAT_H - FIT.stool * k) };
}

const faceBoard = (x: number, z: number) => Math.atan2(BOARD.x - x, BOARD.z - z);

/** Families watching the dance before the stage: their knots' middles (map x, z) and sizes (left and right of the aisle). */
const WATCH: readonly [number, number, number][] = [
  [377.4, -277.2, 5],
  [389.6, -277.2, 5],
  [367.8, -276.4, 4],
  [398.2, -276.6, 4],
  [372.2, -273.8, 4],
  [394.6, -273.8, 5],
  [378.4, -273.2, 3],
  [388.6, -273.2, 4],
  [367, -271.4, 3],
  [400.4, -272.2, 3],
  [372.6, -269.4, 2],
  [394.2, -269.2, 3],
];
/** Friends chatting in a circle: its middle and how many. */
const CIRCLES: readonly [number, number, number][] = [
  [370.6, -264.6, 4],
  [395.6, -263.6, 5],
  [376.6, -248.8, 4],
  [390.8, -248.4, 3],
];
/** Couples taking a selfie, the stage and its board behind them: where they stand (side by side, facing away from the board). */
const SELFIES: readonly [number, number][] = [
  [366.5, -266.8],
  [399.5, -264.2],
  [363.4, -275.6],
  [386.6, -246.8],
];
/** Strollers: where they come to and rest (x, z), and the stalls they go round (indices into `STALLS`). */
const STROLLS: readonly [number, number, number[]][] = [
  [366.4, -260.4, [5, 0, 1]],
  [397.6, -259, [4, 6, 3, 2]],
  [372.8, -244.6, [1, 5, 4]],
];
/** Buyers at each stall (`STALLS` order: sweets, grill, drinks, cakes, flowers, toys, cane). */
const QUEUE = [2, 3, 2, 2, 2, 3, 2];
/** Sizes at the tables, on the mats, on the benches. */
const AT_TABLE = [4, 3, 4, 3];
const ON_MAT = [5, 4, 4, 5];
const ON_BENCH = [3, 2, 2, 3];

/**
 * The night's crowd: `max` people at most, in groups, each doing what its spot is for (the plan's `WATCH`, tables,
 * mats, benches, `CIRCLES`, `SELFIES`, the fires, the stalls' queues, `STROLLS`, the sala's monks), the first coming
 * first. Half the groups (every other of each kind) stay home on the low graphics level.
 */
export function planCrowd(max: number): NyeCrowdPlan {
  const rnd = mulberry32(0x2027);
  const members: Member[] = [];
  const groups: Group[] = [];
  const mats = MATS.map(() => -1);
  let seed = 9100;
  // (adds a member; their route by their place's way in)
  const add = (g: number, m: Partial<Member> & Pick<Member, 'look' | 'role' | 'x' | 'z' | 'kid' | 'low'>, arrive?: [number, number]): number => {
    const k = members.filter((o) => o.group === g).length;
    const [ex, ez] = arrive ?? [m.x, m.z];
    const route = groups[g].act === 'monk' ? salaRoute(ex, ez) : routeTo(ex, ez, m.settle ? 1.6 : 0.4);
    members.push({
      eatLook: null,
      act: groups[g].act,
      group: g,
      idx: k,
      yaw: faceBoard(m.x, m.z),
      lift: 0,
      settle: 0,
      cx: m.x,
      cz: m.z,
      phone: false,
      sparkler: false,
      selfie: 0,
      jumps: m.kid,
      carrier: -1,
      partner: -1,
      lag: k * 1.1,
      side: k % 2 ? -0.9 : 0.9,
      visits: null,
      ...m,
      route,
      cum: lengths(route),
    });
    return members.length - 1;
  };
  const group = (act: Act, v: number): number => {
    groups.push({ start: 0, leave: 0, v, act });
    return groups.length - 1;
  };
  const room = (n: number) => members.length + n <= max;
  // (two grown-ups of a group turn to each other at midnight)
  const pair = (g: number) => {
    const grown = members.flatMap((m, k) => (m.group === g && !m.kid && m.role !== 'shoulder' ? [k] : []));
    if (grown.length < 2) return;
    members[grown[0]].partner = grown[1];
    members[grown[1]].partner = grown[0];
  };
  /** A grown-up of a family: the first a woman, the second a man, an elder now and then. */
  const grownUp = (j: number, o: { phone?: boolean; elder?: boolean } = {}): Look => festive(o.elder ? 'elder' : j === 1 ? 'man' : j === 0 ? 'woman' : rnd() < 0.5 ? 'man' : 'woman', seed++, { phone: o.phone });

  // The monks in the sala: on its mat, facing the square.
  {
    const g = group('monk', 0.8);
    [-1.5, 0, 1.5].forEach((dz, k) => {
      const x = SALA.x + 1.4 + (k === 1 ? 0.2 : 0);
      const z = SALA.z + dz;
      const foot = { x: SALA.x + SALA.w / 2 + 1.5, z: SALA.z + dz * 0.4 };
      add(g, { look: dress('monk', seed++, { age: k === 1 ? 'old' : undefined }), role: 'sit', x, z, yaw: Math.PI / 2 + 0.06 * dz, lift: -1, settle: Math.hypot(foot.x - x, foot.z - z), kid: false, low: true, jumps: false }, [foot.x, foot.z]);
    });
  }
  // The families on the mats: a grandparent, a mother, children (a father standing by now and then).
  MATS.forEach((mt, i) => {
    const n = ON_MAT[i];
    if (!room(n)) return;
    const g = group('mat', 0.85);
    mats[i] = g;
    const across = mt.w > mt.d;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + 0.4;
      const x = mt.x + Math.cos(a) * (across ? 0.85 : 0.6);
      const z = mt.z + Math.sin(a) * (across ? 0.6 : 0.85);
      const kid = j >= 2;
      const look = kid ? child(seed++, j === 4 && rnd() < 0.7) : festive(j === 0 ? 'elder' : 'woman', seed++, { phone: j === 1 });
      add(g, { look, role: 'sit', x, z, yaw: Math.atan2(mt.x - x, mt.z - z), cx: mt.x, cz: mt.z, kid, phone: j === 1, sparkler: look.carry === CARRY.torch, low: i < 2 });
    }
  });
  // The elders on the benches (a grandchild beside them now and then).
  BENCHES.forEach((bn, i) => {
    const n = ON_BENCH[i];
    if (!room(n)) return;
    const g = group('bench', 0.7);
    for (let j = 0; j < n; j++) {
      const u = (j - (n - 1) / 2) * 0.72;
      const bx = bn.x + Math.cos(bn.facing) * u;
      const bz = bn.z - Math.sin(bn.facing) * u;
      const kid = j === 2;
      const look = kid ? child(seed++, false) : festive('elder', seed++);
      const st = seated(look, bx, bz, bn.facing);
      const ax = bx + Math.sin(bn.facing) * 0.9;
      const az = bz + Math.cos(bn.facing) * 0.9;
      add(g, { look, role: 'seat', x: st.x, z: st.z, yaw: bn.facing, lift: st.lift, settle: Math.hypot(ax - st.x, az - st.z) + 0.3, cx: RING.x, cz: RING.z, kid, low: i === 0 || i === 3 }, [ax, az]);
    }
  });
  // Families and friends eating at the tables (stools nearest the way in first).
  TABLES.forEach((t, i) => {
    const n = AT_TABLE[i];
    if (!room(n)) return;
    const g = group('table', 0.95);
    const stools = tableStools(t);
    for (let j = 0; j < n; j++) {
      const st = stools[j];
      const kid = n === 4 && j >= 2;
      const phone = !kid && rnd() < 0.4;
      const look = kid ? child(seed++, false) : grownUp(j, { phone });
      const at = seated(look, st.x, st.z, st.facing);
      // (they come to behind their stool, then sit)
      const ax = st.x - Math.sin(st.facing) * 0.7;
      const az = st.z - Math.cos(st.facing) * 0.7;
      add(g, { look, eatLook: eating(look), role: 'seat', x: at.x, z: at.z, yaw: st.facing, lift: at.lift, settle: Math.hypot(ax - at.x, az - at.z), cx: t.x, cz: t.z, kid, phone, low: i === 0 || i === 3 }, [ax, az]);
    }
    pair(g);
  });
  // The fire bowls: children chasing each other round them, sparklers in hand.
  FIRES.forEach((f, i) => {
    if (!room(3)) return;
    const g = group('chase', 1.0);
    for (let j = 0; j < 3; j++) {
      const a = (j / 3) * Math.PI * 2 + i;
      const x = f.x + Math.cos(a) * 2.3;
      const z = f.z + Math.sin(a) * 2.3;
      const sparkler = j !== 1;
      add(g, { look: child(seed++, sparkler), role: 'run', x, z, yaw: Math.atan2(f.x - x, f.z - z), cx: f.x, cz: f.z, kid: true, sparkler, low: i === 0 });
    }
  });
  // Friends chatting in circles.
  CIRCLES.forEach(([cx, cz, n], i) => {
    if (!room(n)) return;
    const g = group('circle', 1.05 + 0.1 * rnd());
    const r = 0.75 + 0.12 * n;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rnd();
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const phone = rnd() < 0.45;
      const look = festive(rnd() < 0.5 ? 'man' : 'woman', seed++, { phone });
      add(g, { look, role: 'stand', x, z, yaw: Math.atan2(cx - x, cz - z), cx, cz, kid: false, phone, low: i === 0 || i === 3, jumps: rnd() < 0.4 });
    }
    pair(g);
  });
  // Couples taking selfies.
  SELFIES.forEach(([x, z], i) => {
    if (!room(2)) return;
    const yaw = Math.atan2(x - BOARD.x, z - BOARD.z);
    const g = group('selfie', 1.0);
    for (let j = 0; j < 2; j++) {
      const u = j ? -0.36 : 0.36;
      const px = x + Math.cos(yaw) * u;
      const pz = z - Math.sin(yaw) * u;
      const look = festive(j ? 'man' : 'woman', seed++, j ? { peace: true } : { phone: true });
      add(g, { look, role: 'stand', x: px, z: pz, yaw, cx: x, cz: z, kid: false, phone: j === 0, selfie: j ? 2 : 1, low: i < 2, jumps: true });
    }
    pair(g);
  });
  // Buyers at each stall, in a short line to the right of where he buys (the shop's spot stays free).
  STALLS.forEach((s, i) => {
    const n = QUEUE[i];
    if (!room(n)) return;
    const g = group('queue', 1.0);
    const c = Math.cos(s.facing);
    const sn = Math.sin(s.facing);
    const front = (s.kind === 'cane' ? 1.3 : 1.6) * STALL_K;
    for (let j = 0; j < n; j++) {
      const lx = 0.95 * STALL_K + 0.25 * j;
      const lz = front + 0.85 * j;
      const x = s.x + lx * c + lz * sn;
      const z = s.z - lx * sn + lz * c;
      const kid = s.kind === 'toys' && j > 0;
      const phone = !kid && j > 0 && rnd() < 0.5;
      add(g, { look: kid ? child(seed++, false) : grownUp(j, { phone }), role: 'stand', x, z, yaw: s.facing + Math.PI, cx: s.x, cz: s.z, kid, phone, low: i === 0 || i === 2 || i === 5 || i === 6 });
    }
  });
  // Strollers going round the stalls.
  STROLLS.forEach(([x, z, stalls], i) => {
    const n = i === 1 ? 3 : 2;
    if (!room(n)) return;
    const g = group('stroll', 0.85);
    const pts: number[] = [];
    let [px, pz] = [x, z];
    for (const si of [...stalls, -1]) {
      const s = STALLS[si];
      const [tx, tz] = s ? [s.x + Math.sin(s.facing) * 2.6 * STALL_K, s.z + Math.cos(s.facing) * 2.6 * STALL_K] : [x, z];
      const w = way(px, pz, tx, tz);
      for (let k = 0; k < w.length - 2; k += 2) pts.push(w[k], w[k + 1], 0, NaN);
      pts.push(tx, tz, s ? 16 + 10 * rnd() : 34 + 14 * rnd(), s ? s.facing + Math.PI : faceBoard(x, z));
      [px, pz] = [tx, tz];
    }
    for (let j = 0; j < n; j++) {
      const kid = n === 3 && j === 2;
      const ox = (j - (n - 1) / 2) * 0.7;
      const phone = !kid && rnd() < 0.5;
      add(g, { look: kid ? child(seed++, rnd() < 0.5) : grownUp(j, { phone }), role: 'stroll', x: x + ox, z, kid, phone, low: i === 1, visits: new Float32Array(pts) });
    }
    pair(g);
  });
  // Families watching the dance before the stage, nearest first (a child on a father's shoulders now and then).
  WATCH.forEach(([cx, cz, size], i) => {
    if (!room(Math.min(size, 3))) return;
    const g = group('watch', 1.0 + 0.12 * rnd());
    const n = Math.min(size, max - members.length);
    const kids = n <= 2 ? 0 : n - 2 - (n === 5 ? 1 : 0);
    const yaw0 = faceBoard(cx, cz);
    const first = members.length;
    for (let j = 0; j < n; j++) {
      const isKid = j >= n - kids;
      const row = j < 3 ? 0 : 1;
      const u = row ? (j - 3.5) * 0.72 : (j - 1) * 0.74;
      const v = row * 0.8 + (rnd() - 0.5) * 0.2;
      const x = cx + Math.cos(yaw0) * u - Math.sin(yaw0) * v;
      const z = cz - Math.sin(yaw0) * u - Math.cos(yaw0) * v;
      if (isKid && j === n - 1 && rnd() < 0.45) {
        add(g, { look: child(seed++, false), role: 'shoulder', x: cx, z: cz, kid: true, low: i % 2 === 0, carrier: first + 1, jumps: false });
        continue;
      }
      if (isKid) {
        const sparkler = rnd() < 0.35;
        add(g, { look: child(seed++, sparkler), role: 'stand', x, z, kid: true, sparkler, low: i % 2 === 0 });
      } else {
        const elder = n === 5 && j === 2;
        const phone = !elder && rnd() < 0.5;
        add(g, { look: grownUp(j, { phone, elder }), role: 'stand', x, z, yaw: yaw0 + (rnd() - 0.5) * 0.4, kid: false, phone, low: i % 2 === 0, jumps: n <= 2 && rnd() < 0.5 });
      }
    }
    pair(g);
    // (a shoulder child's carrier: the family's man if standing, else none)
    for (let k = first; k < members.length; k++) {
      const m = members[k];
      if (m.role !== 'shoulder') continue;
      const c = members[m.carrier];
      if (!c || c.group !== g || c.role !== 'stand' || c.kid) m.role = 'stand';
    }
  });
  schedule(groups, members, rnd);
  return { members, groups, mats };
}

/**
 * When each group comes and goes. The monks first (22:22), then the mats and benches' elders and the tables, the
 * families before the stage, the rest through the first hour of the night (a few late, until 23:30); home after the
 * show from 00:08 (elders and mats first), the last by 00:40.
 */
function schedule(groups: Group[], members: Member[], rnd: () => number): void {
  const FROM: Record<Act, [number, number]> = {
    monk: [120, 60],
    mat: [300, 1300],
    bench: [400, 1400],
    table: [500, 1700],
    watch: [600, 2400],
    chase: [900, 1600],
    circle: [800, 2800],
    selfie: [1000, 2800],
    queue: [1100, 3000],
    stroll: [1300, 2800],
  };
  groups.forEach((gr, g) => {
    const [a, span] = FROM[gr.act];
    const late = gr.act !== 'monk' && rnd() < 0.08;
    const arrive = late ? -2600 - 800 * rnd() : COME_FROM + a + span * rnd();
    // (setting out so they reach the gate then: the walk's length at their pace)
    const c = members.find((m) => m.group === g)!.cum;
    gr.start = Math.max(COME_FROM, arrive - c[c.length - 1] / gr.v);
    const early = gr.act === 'mat' || gr.act === 'bench' || gr.act === 'monk';
    gr.leave = early ? 520 + 400 * rnd() : 600 + (ALL_GONE - 600 - 300) * rnd() ** 1.3;
  });
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
  const fade = Math.min(1, d / 4, Math.max(0, (c[Math.min(n - 1, LANTERN_WALK.length)] - 3 - d) / 6));
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

/** A family's picnic on their mat (rig space: its middle): a tiffin carrier, bowls, a basket of fruit. */
export function picnicDef(seed: number): RigDef {
  const d = new RigDef();
  d.box([0.1, 0.12, 0.05], [0.18, 0.2, 0.18], 0xb8b8b4).box([0.1, 0.24, 0.05], [0.06, 0.05, 0.06], 0x8a8a86);
  for (const [x, z] of [
    [-0.25, 0.2],
    [-0.3, -0.15],
    [0.32, -0.25],
  ])
    d.box([x, 0.06, z], [0.14, 0.07, 0.14], 0xf2efe8).box([x, 0.09, z], [0.1, 0.02, 0.1], [0xd8a040, 0xe8d8b0, 0xc8843a][seed % 3]);
  d.box([-0.05, 0.06, -0.35], [0.3, 0.1, 0.22], 0xb8945a).box([-0.08, 0.13, -0.35], [0.1, 0.08, 0.1], 0xe8c040).box([0.04, 0.13, -0.33], [0.08, 0.08, 0.08], 0x6a9a2a);
  return d;
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

