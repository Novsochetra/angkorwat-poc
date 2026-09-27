import { TRAILS } from '../layout';

/**
 * Where the sugar-palm village's pieces stand (world metres), worked out
 * from the layout (the `east village road` trail: its street) with no
 * three.js: the hamlet part builds from it (`_eastVillage.ts`), and its
 * people (people/_sceneEastVillage.ts) read the same spots (`EV_SPOTS`)
 * without loading the build. Heights come from the land at build time
 * (the village lies flat, about 10 m): a spot gives (x, z) and how high
 * over the ground it is (`lift`), and whoever uses it reads the floor.
 *
 * A house's frame (like the floating village's): `x, z` its floor's
 * middle, `facing` the way its front looks (radians: toward (sin, cos) in
 * x, z; its local +z), local x across the front (the ridge runs along it).
 */

/** The rise and run of a stair step (m). */
export const EV_STEP = 0.5;
/** Floor over the ground: tall enough to walk and hang hammocks under (the explorer is 2.3 m). */
export const EV_LIFT = 3.0;
/** Wall height over the floor (m): the eaves over the veranda leave the explorer room. */
export const EV_WALL = 3.0;

export type EvRoof = 'tile' | 'thatch' | 'tin' | 'rust';
/**
 * The Khmer house forms: `dol` (ផ្ទះរោងដោល, a plain gable roof over the rooms and the
 * veranda), `kantaing` (ផ្ទះកន្តាំង, a steep gable over the rooms and a lower roof
 * skirt all round, over the veranda in front), `pet` (ផ្ទះប៉ិត, the plain gable with a
 * little gabled porch roof over the head of the front stair).
 */
export type EvForm = 'dol' | 'kantaing' | 'pet';
export type EvWalls = 'wood' | 'white' | 'blue' | 'green' | 'yellow' | 'pink';
/** What lives in the shade under a house. */
export type EvUnder = 'hammock' | 'kre' | 'loom' | 'moto' | 'bikes' | 'cart' | 'jars' | 'woodpile' | 'coop' | 'mortar' | 'traps';

/** One house of the village: where it stands, its size and look, what is round it. */
export interface EvHome {
  id: string;
  x: number;
  z: number;
  facing: number;
  form: EvForm;
  /** Across (along the ridge), the rooms' depth, the veranda's depth in front (m). */
  w: number;
  d: number;
  v: number;
  roof: EvRoof;
  walls: EvWalls;
  /** Stilts of dark hardwood, or whitewashed concrete (a newer house). */
  posts: 'wood' | 'concrete';
  /** Where the front stair leaves the veranda (local x). */
  stairX: number;
  /** A sunburst of planks in the gable at local +x (1), −x (−1), both (2), neither (0). */
  sun: number;
  /** The kitchen hut on the ground behind the house, at local x side −1 or +1 (0: none); `wok`: its stove carries a big wok (supper is stirred in it). */
  kitchen: number;
  wok?: boolean;
  /** Lived in tonight: lit windows, a lamp on the veranda (`tube`: a fluorescent tube on a battery, not an oil lantern). */
  lit: boolean;
  tube?: boolean;
  under: EvUnder[];
  /** A spirit house on its post in the front yard; washing on a line; hens; flowers by the stair; a dog asleep. */
  spirit?: boolean;
  laundry?: boolean;
  hens?: boolean;
  flowers?: boolean;
  dog?: boolean;
  /** A fence with a gate along the street in front of it. */
  fence?: boolean;
  seed: number;
}

// ── The street ──────────────────────────────────────────────────────────────

/** The village street: the `east village road` trail from where it leaves the market square. */
const STREET: [number, number][] = (TRAILS.find((t) => t.name === 'east village road')?.points ?? [
  [336, -84],
  [358, -72],
  [384, -66],
  [410, -62],
  [436, -60],
  [456, -60],
  [472, -62],
]).filter(([x]) => x >= 336);

/** The street's middle line at `x` (it runs west to east) and its way there (unit, eastward). */
export function streetAt(x: number): { x: number; z: number; tx: number; tz: number } {
  for (let i = 0; i < STREET.length - 1; i++) {
    const [ax, az] = STREET[i];
    const [bx, bz] = STREET[i + 1];
    if (x <= bx || i === STREET.length - 2) {
      const l = Math.hypot(bx - ax, bz - az);
      const t = (x - ax) / (bx - ax);
      return { x, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l };
    }
  }
  return { x, z: STREET[0][1], tx: 1, tz: 0 };
}

/** North of the street (−1) or south (+1). */
type Side = -1 | 1;

type Look = Omit<EvHome, 'id' | 'x' | 'z' | 'facing'>;

/**
 * A house by the street at `x`, on `side`, its middle `setback` m from the
 * street's middle line, its front toward the street; `turn`: gable-end on
 * to the street, its front looking along it (−1 west, +1 east).
 */
function byStreet(id: string, x: number, side: Side, setback: number, look: Look, turn: -1 | 0 | 1 = 0): EvHome {
  const s = streetAt(x);
  // (north of an eastward way is (tz, −tx); south (−tz, tx))
  const nx = side < 0 ? s.tz : -s.tz;
  const nz = side < 0 ? -s.tx : s.tx;
  const facing = turn === 0 ? Math.atan2(-nx, -nz) : Math.atan2(turn * s.tx, turn * s.tz);
  return { id, x: x + nx * setback, z: s.z + nz * setback, facing, ...look };
}

/** A house standing by itself (a yard behind the street, over the stream), its front looking at (tx, tz). */
function facingPoint(id: string, x: number, z: number, tx: number, tz: number, look: Look): EvHome {
  return { id, x, z, facing: Math.atan2(tx - x, tz - z), ...look };
}

/**
 * The houses: five along each side of the street, one round each back yard,
 * two over the stream. Their looks mix the village: the three Khmer forms
 * (`form`); red-brown tiles, palm thatch, rusty or grey tin; plain wood,
 * whitewash, pastel blue, green, yellow and pink walls; a fan of rays in the
 * gables the two turned houses show the street (n1 at the village's west
 * end, s3 by the palm lane).
 */
export const EV_HOMES: EvHome[] = [
  // ── North of the street, west to east ──
  byStreet('n1', 366, -1, 9, { form: 'dol', w: 7, d: 4.5, v: 2, roof: 'tile', walls: 'white', posts: 'concrete', stairX: 1.9, sun: -1, kitchen: -1, lit: true, under: ['kre', 'jars', 'bikes'], spirit: true, flowers: true, fence: false, seed: 1 }, 1),
  byStreet('n2', 380, -1, 12, { form: 'pet', w: 6.5, d: 4.5, v: 2, roof: 'rust', walls: 'blue', posts: 'wood', stairX: 1.9, sun: 0, kitchen: -1, lit: true, tube: true, under: ['hammock', 'woodpile', 'coop'], hens: true, laundry: true, fence: true, seed: 2 }),
  byStreet('n3', 393, -1, 12, { form: 'kantaing', w: 7, d: 4.5, v: 2.2, roof: 'tile', walls: 'wood', posts: 'wood', stairX: -2, sun: 2, kitchen: -1, wok: true, lit: true, under: ['loom', 'jars', 'moto'], flowers: true, fence: true, seed: 3 }),
  byStreet('n4', 426, -1, 12, { form: 'dol', w: 7, d: 4.5, v: 2, roof: 'thatch', walls: 'wood', posts: 'wood', stairX: 2, sun: 0, kitchen: 1, lit: false, under: ['cart', 'woodpile', 'mortar'], hens: true, dog: true, fence: true, seed: 4 }),
  byStreet('n5', 435, -1, 11.5, { form: 'pet', w: 6, d: 4.5, v: 2, roof: 'tile', walls: 'green', posts: 'concrete', stairX: -1.6, sun: 0, kitchen: -1, lit: true, under: ['hammock', 'traps', 'jars'], laundry: true, fence: true, seed: 5 }),
  // ── South of the street ──
  byStreet('s1', 370, 1, 12, { form: 'pet', w: 7, d: 4.5, v: 2, roof: 'tin', walls: 'yellow', posts: 'concrete', stairX: -2, sun: 0, kitchen: -1, wok: true, lit: true, tube: true, under: ['moto', 'kre', 'jars'], spirit: true, fence: true, seed: 6 }),
  byStreet('s2', 384, 1, 12, { form: 'kantaing', w: 6.5, d: 5, v: 2, roof: 'tile', walls: 'wood', posts: 'wood', stairX: 1.8, sun: 0, kitchen: 1, lit: true, under: ['hammock', 'loom', 'coop'], hens: true, flowers: true, fence: true, seed: 7 }),
  byStreet('s3', 406.5, 1, 9, { form: 'dol', w: 7, d: 5, v: 2, roof: 'tile', walls: 'pink', posts: 'concrete', stairX: 2, sun: -1, kitchen: 1, lit: true, under: ['kre', 'bikes', 'jars'], spirit: true, laundry: true, seed: 8 }, -1),
  byStreet('s4', 421, 1, 12, { form: 'dol', w: 7, d: 4.5, v: 2, roof: 'rust', walls: 'wood', posts: 'wood', stairX: -2, sun: 0, kitchen: -1, lit: true, under: ['hammock', 'woodpile', 'moto'], dog: true, fence: true, seed: 9 }),
  byStreet('s5', 433, 1, 11.5, { form: 'dol', w: 6.5, d: 4.5, v: 2, roof: 'thatch', walls: 'blue', posts: 'wood', stairX: 1.8, sun: 0, kitchen: 1, lit: true, under: ['kre', 'traps', 'coop'], hens: true, fence: true, seed: 10 }),
  // ── Round the back yards ──
  facingPoint('ny1', 379, -101, 379, -80, { form: 'kantaing', w: 7, d: 4.5, v: 2, roof: 'tile', walls: 'wood', posts: 'wood', stairX: -1.9, sun: 2, kitchen: 1, lit: true, under: ['hammock', 'loom', 'woodpile'], hens: true, laundry: true, seed: 11 }),
  facingPoint('sy1', 377, -35, 377, -60, { form: 'pet', w: 6.5, d: 4.5, v: 2, roof: 'rust', walls: 'green', posts: 'wood', stairX: 1.8, sun: 0, kitchen: -1, lit: true, under: ['cart', 'jars', 'coop'], hens: true, flowers: true, seed: 12 }),
  // ── Over the stream, east of the foot bridge ──
  facingPoint('e1', 469, -78, 461, -60, { form: 'kantaing', w: 6.5, d: 4.5, v: 2, roof: 'tile', walls: 'yellow', posts: 'concrete', stairX: 1.8, sun: 0, kitchen: 1, lit: true, under: ['hammock', 'moto', 'jars'], spirit: true, seed: 13 }),
  facingPoint('e2', 461.5, -44, 459, -62, { form: 'dol', w: 6.5, d: 4.5, v: 2, roof: 'thatch', walls: 'wood', posts: 'wood', stairX: -1.8, sun: 0, kitchen: -1, lit: false, under: ['woodpile', 'traps', 'coop'], hens: true, seed: 14 }),
];

// ── A house's own points (local → world) ────────────────────────────────────

/** A house's local metres (x across, +z its front) → world (x, z). */
export function evToWorld(h: { x: number; z: number; facing: number }, lx: number, lz: number): [number, number] {
  const s = Math.sin(h.facing);
  const c = Math.cos(h.facing);
  return [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
}

/** The back of the rooms, the front wall, the veranda's front edge (local z, m). */
export function evDepths(h: EvHome): { zb: number; zw: number; zf: number } {
  const zb = -(h.d + h.v) / 2;
  return { zb, zw: zb + h.d, zf: (h.d + h.v) / 2 };
}

/** The stilts under a house (local x columns, z rows): wide apart (≈ 3 m), so a hammock hangs between two. */
export function evStilts(h: EvHome): { xs: number[]; zs: number[] } {
  const { zb, zf } = evDepths(h);
  const nx = Math.max(2, Math.round(h.w / 3.3) + 1);
  const nz = Math.max(2, Math.round((zf - zb) / 2.6) + 1);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < nx; i++) xs.push(-h.w / 2 + 0.2 + ((h.w - 0.4) * i) / (nx - 1));
  for (let j = 0; j < nz; j++) zs.push(zb + 0.2 + ((zf - zb - 0.4) * j) / (nz - 1));
  return { xs, zs };
}

/**
 * Steps of the front stair (rises of `EV_STEP` from the ground to the floor) and where its foot is (local z).
 * Its width lets the roaming explorer (1.4 × his size, roam/walker.ts) up it and onto the veranda through the
 * railing's opening: the walk map's 0.5 m columns take the rails' and posts' blocks whole (roam/walkmap.ts).
 */
export function evStair(h: EvHome): { steps: number; footZ: number; width: number } {
  const steps = Math.round(EV_LIFT / EV_STEP);
  const { zf } = evDepths(h);
  return { steps, footZ: zf + (steps - 1) * EV_STEP + 0.6, width: 1.8 };
}

/** Where the kitchen hut stands (local: its middle, size), or null. */
export function evKitchen(h: EvHome): { x: number; z: number; w: number; d: number } | null {
  if (!h.kitchen) return null;
  const { zb } = evDepths(h);
  return { x: h.kitchen * (h.w / 2 - 1.5), z: zb - 2.4, w: 3, d: 2.6 };
}

/**
 * The spots of a house for its people (world x, z; `lift`: over the ground,
 * so on the floor for the veranda): the door, the stair's foot, two seats on
 * the veranda (looking out), the hammock, the bed platform (kre), the loom,
 * the kitchen's stove (where the cook squats, facing it), the front yard.
 */
export interface EvHomeSpots {
  id: string;
  facing: number;
  door: { x: number; z: number; lift: number };
  stairFoot: { x: number; z: number };
  /** The head of the stair, on the veranda. */
  stairTop: { x: number; z: number; lift: number };
  seats: { x: number; z: number; lift: number; yaw: number }[];
  hammock: { x: number; z: number; yaw: number; lift: number } | null;
  kre: { x: number; z: number; yaw: number; lift: number } | null;
  loom: { x: number; z: number; yaw: number; lift: number } | null;
  stove: { x: number; z: number; yaw: number } | null;
  yard: { x: number; z: number };
  /** Sitting on the ground under the floor, by the stilts at the back (mending a net). */
  under: { x: number; z: number; yaw: number };
  /** Squatting at the ox cart's wheel, facing it (a house with a cart beside it). */
  cart: { x: number; z: number; yaw: number } | null;
}

/** Where under a house each thing goes (local): between which stilts. */
export function evUnderSlots(h: EvHome): Record<EvUnder, { x: number; z: number; along: 'x' | 'z' } | undefined> {
  const { xs, zs } = evStilts(h);
  const out: Partial<Record<EvUnder, { x: number; z: number; along: 'x' | 'z' }>> = {};
  // Slots between the stilts: the bays (middle of each 2 × 2 of posts), front ones first.
  const bays: { x: number; z: number }[] = [];
  for (let j = zs.length - 2; j >= 0; j--) for (let i = 0; i < xs.length - 1; i++) bays.push({ x: (xs[i] + xs[i + 1]) / 2, z: (zs[j] + zs[j + 1]) / 2 });
  let k = 0;
  for (const u of h.under) {
    if (u === 'hammock') {
      // (between two posts of the front row: the hammock hangs across the bay's front)
      const i = h.stairX > 0 ? 0 : xs.length - 2;
      out.hammock = { x: (xs[i] + xs[i + 1]) / 2, z: zs[zs.length - 1], along: 'x' };
      continue;
    }
    const b = bays[k++ % bays.length];
    out[u] = { x: b.x, z: b.z, along: 'x' };
  }
  return out as Record<EvUnder, { x: number; z: number; along: 'x' | 'z' } | undefined>;
}

export function evHomeSpots(h: EvHome): EvHomeSpots {
  const { zw, zf } = evDepths(h);
  const st = evStair(h);
  const w = (lx: number, lz: number) => evToWorld(h, lx, lz);
  const [dx, dz] = w(0, zw + 0.6);
  const [fx, fz] = w(h.stairX, st.footZ + 0.3);
  const seatX = h.stairX > 0 ? -h.w / 2 + 1.3 : h.w / 2 - 1.3;
  const seats = [seatX, seatX + (h.stairX > 0 ? 1.1 : -1.1)].map((lx) => {
    const [x, z] = w(lx, zf - 0.7);
    return { x, z, lift: EV_LIFT, yaw: h.facing };
  });
  const slots = evUnderSlots(h);
  const put = (s: { x: number; z: number } | undefined, dz = 0) => (s ? w(s.x, s.z + dz) : null);
  const ham = put(slots.hammock);
  const kre = put(slots.kre);
  const loom = put(slots.loom, 1.1);
  const k = evKitchen(h);
  const stove = k ? w(k.x - 0.3, k.z + 0.35) : null;
  const [yx, yz] = w(-h.stairX * 0.6, st.footZ + 1.6);
  const [tx, tz] = w(h.stairX, zf - 0.45);
  const { xs, zs } = evStilts(h);
  const [ux, uz] = w((xs[0] + xs[1]) / 2 + (h.stairX > 0 ? 0 : xs[xs.length - 1] - xs[1]), zs[0] + 0.9);
  // (the cart stands beside the house on the side away from the stair, its wheel 0.74 m out from its middle)
  const far = h.stairX > 0 ? -1 : 1;
  const cartAt = h.under.includes('cart') ? w(far * (h.w / 2 + 1.9 + 0.74 + 0.55), evDepths(h).zb + 1) : null;
  return {
    id: h.id,
    facing: h.facing,
    door: { x: dx, z: dz, lift: EV_LIFT },
    stairFoot: { x: fx, z: fz },
    stairTop: { x: tx, z: tz, lift: EV_LIFT },
    seats,
    hammock: ham ? { x: ham[0], z: ham[1], yaw: h.facing + Math.PI / 2, lift: 0.62 } : null,
    kre: kre ? { x: kre[0], z: kre[1], yaw: h.facing, lift: 0.55 } : null,
    // (the weaver on her low bench in front of the loom, facing it, toward the house's back: her feet on the ground)
    loom: loom ? { x: loom[0], z: loom[1], yaw: h.facing + Math.PI, lift: 0 } : null,
    stove: stove ? { x: stove[0], z: stove[1], yaw: h.facing + Math.PI } : null,
    yard: { x: yx, z: yz },
    under: { x: ux, z: uz, yaw: h.facing },
    cart: cartAt ? { x: cartAt[0], z: cartAt[1], yaw: h.facing + (far > 0 ? -Math.PI / 2 : Math.PI / 2) } : null,
  };
}

// ── The village's other pieces ──────────────────────────────────────────────

/** The rice granaries (small raised barns): middle, facing (their door), size. */
export const EV_GRANARIES = [
  { x: 368.5, z: -93, facing: Math.PI / 2, w: 2.6, d: 2.2, roof: 'thatch' as EvRoof, seed: 31 },
  { x: 390, z: -40, facing: -Math.PI / 2, w: 2.6, d: 2.2, roof: 'tin' as EvRoof, seed: 32 },
];

/** The cattle pen in the north yard (a rail fence, a shelter, a trough): its middle, size, and the gate on its south side. */
export const EV_PEN = { x: 393, z: -92, w: 7, d: 5.5, gate: { x: 390.5, z: -89.25 } };

/** The public hand pump by the street (a concrete apron, a basin). */
export const EV_PUMP = { x: 400.4, z: -58.2, facing: 0 };

/** The sala, the open rest pavilion by the street at the Kulen trail's corner (a raised plank floor, a water jar for passers-by). */
export const EV_SALA = { x: 402.8, z: -69.2, facing: 0.15, w: 4.6, d: 3 };

/** The village's spirit house and the big tamarind at the corner of the street and the Kulen trail. */
export const EV_SPIRIT = { x: 407.2, z: -66.9, facing: 0.1 };
export const EV_TAMARIND = { x: 416.5, z: -77 };

/** The little shop by the street in front of s4 (drinks, snacks, petrol in glass bottles). */
export const EV_KIOSK = { x: 414.8, z: -56.2, facing: Math.PI + 0.06 };

/**
 * The washing steps upstream of the bridge: they go down the village bank's
 * face (north, along it) from its top at `z`; the build finds the bank's lip
 * east of `x` and fills in where the steps' top, the landing at the water
 * (facing it) and the sand strip below the bank are.
 */
export const EV_WASH_AT = {
  x: 440,
  z: -77,
  top: { x: 441, y: 10, z: -76.4 },
  /** The last tread at the foot of the steps. */
  foot: { x: 442.9, y: 6, z: -81 },
  landing: { x: 444.6, y: 5.4, z: -83, yaw: Math.PI / 2 },
  sand: { x: 443, y: 6, z: -88.5 },
};

/** Rice straw stacks (round mounds on a pole). */
export const EV_STRAW: [number, number, number][] = [
  [399.5, -93, 1],
  [383.5, -29, 0.85],
  [363.5, -45, 0.95],
  [460.5, -91.5, 0.9],
];

/** Where the cattle graze by day (over the stream, north of the east houses), and the way home to the pen at dusk: over the bridge, west along the street, up the lane. */
export const EV_MEADOW = { x: 466, z: -95, r: 7 };
export const EV_HERD_WAY: [number, number][] = [
  [466, -95],
  [462, -84],
  [460.5, -68],
  [459, -60.5],
  [448, -60],
  [436, -60],
  [420, -61.3],
  [404, -63.3],
  [387, -65.9],
  [386.2, -80],
  [389.5, -86.5],
  [392.5, -90],
];

/** Where the children play: the south yard (they run down to the stream too: `EV_WASH_AT.sand`). */
export const EV_PLAY = { x: 376, z: -46.5, r: 3.5 };

/** All the spots for the people (world), one list per kind. */
export const EV_SPOTS = {
  homes: EV_HOMES.map(evHomeSpots),
  pen: EV_PEN,
  pump: EV_PUMP,
  sala: EV_SALA,
  wash: EV_WASH_AT,
  meadow: EV_MEADOW,
  herdWay: EV_HERD_WAY,
  play: EV_PLAY,
};

/**
 * The foot bridge as built (the build fills it in from the street's crossing
 * of the stream): its ends (m) and its deck's height at each end and its
 * arch; `evDeck` gives the deck under a point on it, for the riders and the
 * cattle crossing.
 */
export const EV_BRIDGE_AT = { built: false, ax: 0, az: 0, bx: 0, bz: 0, ya: 0, yb: 0, arch: 0, half: 1.2 };

/** The bridge's deck top at (x, z), or NaN off it. */
export function evDeck(x: number, z: number): number {
  const B = EV_BRIDGE_AT;
  if (!B.built) return NaN;
  const dx = B.bx - B.ax;
  const dz = B.bz - B.az;
  const l2 = dx * dx + dz * dz;
  const t = ((x - B.ax) * dx + (z - B.az) * dz) / l2;
  if (t < 0 || t > 1) return NaN;
  const across = Math.abs((x - B.ax) * dz - (z - B.az) * dx) / Math.sqrt(l2);
  if (across > B.half) return NaN;
  return B.ya + (B.yb - B.ya) * t + B.arch * Math.sin(Math.PI * t);
}

/**
 * The houses that stood up at build time (a house whose ground turned out
 * uneven or wet, after the land was reshaped, is left out): the people
 * keep to these. Filled by the build.
 */
export const EV_BUILT = new Set<string>();
