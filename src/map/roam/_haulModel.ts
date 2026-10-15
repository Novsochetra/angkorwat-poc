import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { MATERIAL_IDS, type MaterialId, type Materials } from '../build/materials';
import { Flock } from '../fauna/_kit';
import { OX } from '../people/_ox';
import { cartDef } from '../people/_sceneCart';
import { Rig, Things } from '../people/_things';

/**
 * His ox cart drawn (the add-on `haul`, roam/_haul.ts): the village's cart
 * (people/_sceneCart.ts `cartDef`, without its straw) and its two white oxen
 * (people/_ox.ts), and what he has loaded on it, every box in ONE instanced
 * mesh of the people's things (people/_things.ts: the same shader as the
 * village's cart, a draw and its shadow) and the oxen in one more (the animals'
 * shader). Written only when something moves or the load changes.
 *
 * **The load** (`loadLayout`): heavy and long things below, as a farmer packs a
 * cart, each piece a few boxes (octagonal at walking distance):
 * - logs (ឈើ) along the bed in rows of three, up to three high: bark, the pale
 *   cut ends behind and before;
 * - bamboo poles (ឫស្សី) over them in a bundle six across, longer than the
 *   cart: they stick out behind the tail and over the front;
 * - bundles of sugar-palm thatch (ស្លឹកត្នោត) on top over the back half: the
 *   dried leaf panels stacked flat, tied with a rattan band;
 * - clay (ដីឥដ្ឋ) in round woven bamboo baskets over the front half, the clay
 *   heaped in them.
 * Each material is drawn up to `CAP` pieces (more lies in the same heap: the
 * prompt and the toasts give the true count).
 *
 * Cart space (true metres, as `cartDef`): feet on y = 0 under the axle, +z
 * toward the oxen, +x its left; the bed's top at y 0.895, its inside ±0.40
 * across, z −1.05‥1.45. The people's scale draws it (`k`).
 */

/** The most pieces of each drawn on the cart. */
export const CAP: Record<MaterialId, number> = { log: 9, bamboo: 12, thatch: 8, clay: 6 };

/** The bed's top (cart space, m). */
const BED = 0.895;

interface ItemBox {
  /** Middle and size (item space: its base's middle at the origin, its length along +z). */
  c: [number, number, number];
  s: [number, number, number];
  color: number;
  /** Every other piece's colour (a fresher pole, a darker bundle), else `color`. */
  alt?: number;
  /** Turned about its length (z) or about y (rad). */
  rz?: number;
  ry?: number;
}

const BARK = 0x6e4a2c;
const BARK_DARK = 0x56391f;
const CUT = 0xc9a06a;
const CUT_RING = 0x9a7244;
const BAMBOO = 0xa9a456;
const BAMBOO_GREEN = 0x7a9244;
const BAMBOO_NODE = 0x5e6a2c;
const SPINE = 0xb3a46c;
const TIPS = 0x6f6a44;
const TIPS_PALE = 0x857f54;
const LEAF = 0x8f8a5e;
const LEAF_DARK = 0x77714a;
const LEAF_PALE = 0xa6a07a;
const RATTAN = 0x4e3620;
const BASKET = 0xb39b6a;
const BASKET_DARK = 0x9a8256;
const RIM = 0x6e5532;
const CLAY = 0x7e4c34;
const CLAY_DARK = 0x683c28;
const ROPE = 0x8a7450;

/** A log: 2.5 m long (its ends out over the let-down tailboard), two square boxes (one turned 45° about its length: round at walking distance), its pale cut ends with a darker heart. */
const LOG_L = 2.5;
const LOG_D = 0.2;
/** A bamboo pole: 3 m, 7.5 cm round, two node bands. */
const POLE_L = 3.0;
const POLE_D = 0.075;
/** A bundle of sugar-palm thatch panels: across, high, along (m). */
const THATCH = { w: 0.72, h: 0.13, d: 0.6 };
/** A basket of clay: across (round), high (m). */
const BASKET_D = 0.42;
const BASKET_H = 0.22;

const TEMPLATES: Record<MaterialId, readonly ItemBox[]> = {
  log: [
    { c: [0, LOG_D * 0.6, 0], s: [LOG_D, LOG_D, LOG_L], color: BARK, alt: 0x76502f },
    { c: [0, LOG_D * 0.6, 0], s: [LOG_D, LOG_D, LOG_L - 0.01], color: BARK_DARK, rz: Math.PI / 4 },
    { c: [0, LOG_D * 0.6, LOG_L / 2 + 0.003], s: [LOG_D * 0.86, LOG_D * 0.86, 0.016], color: CUT, rz: Math.PI / 4 },
    { c: [0, LOG_D * 0.6, LOG_L / 2 + 0.006], s: [LOG_D * 0.5, LOG_D * 0.5, 0.016], color: CUT_RING },
    { c: [0, LOG_D * 0.6, -LOG_L / 2 - 0.003], s: [LOG_D * 0.86, LOG_D * 0.86, 0.016], color: CUT, rz: Math.PI / 4 },
    { c: [0, LOG_D * 0.6, -LOG_L / 2 - 0.006], s: [LOG_D * 0.5, LOG_D * 0.5, 0.016], color: CUT_RING },
  ],
  bamboo: [
    { c: [0, POLE_D / 2, 0], s: [POLE_D, POLE_D, POLE_L], color: BAMBOO, alt: BAMBOO_GREEN, rz: Math.PI / 4 },
    { c: [0, POLE_D / 2, 0.62], s: [POLE_D + 0.014, POLE_D + 0.014, 0.04], color: BAMBOO_NODE, rz: Math.PI / 4 },
    { c: [0, POLE_D / 2, -0.58], s: [POLE_D + 0.014, POLE_D + 0.014, 0.04], color: BAMBOO_NODE, rz: Math.PI / 4 },
  ],
  // (three panels of dried sugar-palm leaf stacked, each a little askew: their edges show as layers; the bamboo spine
  // they are sewn on along one side, the leaves' ragged tips hanging over the other; a rattan tie)
  thatch: [
    { c: [0, 0.022, 0], s: [THATCH.w - 0.04, 0.044, THATCH.d], color: LEAF, alt: LEAF_DARK },
    { c: [0.02, 0.064, 0.03], s: [THATCH.w - 0.06, 0.04, THATCH.d + 0.02], color: LEAF_DARK, alt: LEAF, ry: 0.05 },
    { c: [-0.01, 0.102, -0.02], s: [THATCH.w - 0.1, 0.036, THATCH.d - 0.06], color: LEAF_PALE, ry: -0.04 },
    { c: [-THATCH.w / 2 + 0.02, 0.125, 0], s: [0.045, 0.03, THATCH.d + 0.04], color: SPINE },
    { c: [THATCH.w / 2 - 0.01, 0.06, 0], s: [0.07, 0.085, THATCH.d - 0.04], color: TIPS, rz: -0.35 },
    { c: [THATCH.w / 2 + 0.02, 0.025, 0.06], s: [0.06, 0.05, THATCH.d * 0.6], color: TIPS_PALE, rz: -0.6 },
    { c: [0, 0.064, 0.08], s: [THATCH.w + 0.01, THATCH.h, 0.03], color: RATTAN },
  ],
  // (a round woven basket: three boxes turned 60° from each other, its dark rim; the clay heaped in it)
  clay: [
    { c: [0, BASKET_H / 2, 0], s: [BASKET_D * 0.58, BASKET_H, BASKET_D], color: BASKET },
    { c: [0, BASKET_H / 2, 0], s: [BASKET_D * 0.58, BASKET_H - 0.004, BASKET_D], color: BASKET_DARK, ry: Math.PI / 3 },
    { c: [0, BASKET_H / 2, 0], s: [BASKET_D * 0.58, BASKET_H - 0.008, BASKET_D], color: BASKET, ry: -Math.PI / 3 },
    { c: [0, BASKET_H - 0.01, 0], s: [BASKET_D * 0.93, 0.035, BASKET_D * 0.93], color: RIM, ry: Math.PI / 12 },
    { c: [0, BASKET_H + 0.035, 0], s: [BASKET_D * 0.74, 0.07, BASKET_D * 0.74], color: CLAY, ry: Math.PI / 4 },
    { c: [0.02, BASKET_H + 0.085, -0.01], s: [BASKET_D * 0.48, 0.06, BASKET_D * 0.48], color: CLAY_DARK, ry: 0.3 },
    { c: [0.03, BASKET_H + 0.125, -0.02], s: [BASKET_D * 0.22, 0.04, BASKET_D * 0.22], color: CLAY, ry: 0.9 },
  ],
};
/**
 * How a piece is held as he lifts it in or out (true m): long ones (logs, poles) by their near end, along the way he
 * faces, pushed in over the tail (`reach`: their middle that far before his hands); the others across, before him.
 */
export const HOLD: Record<MaterialId, { along: boolean; reach: number }> = {
  log: { along: true, reach: LOG_L / 2 - 0.2 },
  bamboo: { along: true, reach: POLE_L / 2 - 0.3 },
  thatch: { along: false, reach: 0.05 },
  clay: { along: false, reach: 0.08 },
};
const MOST_BOXES = Math.max(...MATERIAL_IDS.map((m) => TEMPLATES[m].length));

/** A piece's place on the cart: its base's middle (cart space, m), and a small turn about y (rad). */
export interface LoadSpot {
  m: MaterialId;
  /** Its number among its material's (0 first loaded). */
  i: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** A small fixed turn for each piece (no two lie exactly straight). */
const jitter = (m: MaterialId, i: number) => (((i * 7919 + m.length * 104729) % 97) / 97 - 0.5) * 0.06;

/** Logs: three across (middle, left, right), up to three high, along the bed. */
const LOG_X = [0, 0.22, -0.22];
const LOG_Z = 0.0;
/** Bamboo: six across (middle out), rows over the logs; its length over the bed's middle, sticking out behind and before. */
const POLE_X = [0.047, -0.047, 0.142, -0.142, 0.237, -0.237];
const POLE_Z = 0.2;
/** Thatch: two bundles along the back half, stacked. Clay: two across, three along the front half. */
const THATCH_Z = [-0.7, -0.06];
const CLAY_AT: readonly [number, number][] = [
  [0.19, 0.46],
  [-0.19, 0.46],
  [0.19, 0.86],
  [-0.19, 0.86],
  [0.19, 1.25],
  [-0.19, 1.25],
];

/**
 * Where each piece drawn lies on the cart for `counts` (each material up to `CAP`), into `out` (emptied first): the
 * logs on the bed, the bamboo over them, the thatch and the clay on top of both.
 */
export function loadLayout(counts: Materials, out: LoadSpot[]): LoadSpot[] {
  out.length = 0;
  const n = (m: MaterialId) => Math.min(CAP[m], Math.max(0, counts[m] ?? 0));
  const logs = n('log');
  for (let i = 0; i < logs; i++) out.push({ m: 'log', i, x: LOG_X[i % 3], y: BED + Math.floor(i / 3) * LOG_D * 1.15, z: LOG_Z, yaw: jitter('log', i) });
  let top = BED + Math.ceil(logs / 3) * LOG_D * 1.15;
  const poles = n('bamboo');
  // (over the logs' middle: the pile is rounded, the poles settle in it)
  const pb = logs > 0 ? top - 0.03 : BED;
  // (a second row nested in the first's grooves; the poles' ends not quite in line)
  for (let i = 0; i < poles; i++) {
    const row = Math.floor(i / 6);
    out.push({ m: 'bamboo', i, x: POLE_X[i % 6] * (row % 2 ? 0.8 : 1), y: pb + row * POLE_D * 0.85, z: POLE_Z + jitter('bamboo', i) * 3, yaw: jitter('bamboo', i) * 0.4 });
  }
  if (poles > 0) top = pb + Math.ceil(poles / 6) * POLE_D * 0.85 + 0.01;
  const bundles = n('thatch');
  // (stalks one way, then the other, as bundles are laid)
  for (let i = 0; i < bundles; i++) out.push({ m: 'thatch', i, x: 0, y: top + Math.floor(i / 2) * THATCH.h, z: THATCH_Z[i % 2], yaw: (Math.floor(i / 2) % 2 ? Math.PI : 0) + jitter('thatch', i) * 2 });
  const baskets = n('clay');
  for (let i = 0; i < baskets; i++) out.push({ m: 'clay', i, x: CLAY_AT[i][0], y: top, z: CLAY_AT[i][1], yaw: jitter('clay', i) * 3 });
  return out;
}

/** How high (cart space, m) the load reaches for `counts` (the bed's top when empty). */
export function loadTop(counts: Materials): number {
  const spots = loadLayout(counts, _spots);
  let top = BED;
  for (const s of spots) {
    const h = s.m === 'log' ? LOG_D * 1.2 : s.m === 'bamboo' ? POLE_D : s.m === 'thatch' ? THATCH.h : BASKET_H + 0.11;
    top = Math.max(top, s.y + h);
  }
  return top;
}
const _spots: LoadSpot[] = [];

/** The oxen's places beside each other under the yoke (m across, people scale ×: as people/_sceneCart.ts). */
export const OX_SIDE = 0.53 * 0.75;
/** Each ox's middle this far (true m) behind its neck at the yoke. */
export const OX_BACK = 0.78;

const _e = new Euler();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _m = new Matrix4();
const _mi = new Matrix4();

/**
 * The cart, its oxen, its load, the piece in his hands and the rope (all hidden until placed). One `Things` of its
 * own (a draw, a shadow), the oxen a `Flock` of two.
 */
export class HaulView {
  readonly things: Things;
  readonly cart: Rig;
  readonly oxen: Flock;
  readonly wheels: [number, number];
  readonly gate: number;
  /** Each template box's matrix in its item's space. */
  private readonly local: Record<MaterialId, Matrix4[]>;
  /** The first slot of each material's pieces (`CAP` × its boxes), the piece in hand's, the rope's two. */
  private readonly base: Record<MaterialId, number>;
  private readonly handBase: number;
  private readonly ropeBase: number;
  /** The cart's own matrix (as `cart.place` has it). */
  readonly root = new Matrix4();
  /** What each material's slots show now (pieces drawn), and the piece in hand. */
  private readonly drawn: Record<MaterialId, number> = { log: 0, bamboo: 0, thatch: 0, clay: 0 };
  private hand: MaterialId | null = null;
  private readonly spots: LoadSpot[] = [];

  constructor() {
    const c = cartDef(false);
    let n = c.def.boxes.length + 2 + MOST_BOXES;
    for (const m of MATERIAL_IDS) n += CAP[m] * TEMPLATES[m].length;
    this.things = new Things(n);
    this.things.mesh.name = 'haul:cart';
    this.cart = new Rig(this.things, c.def);
    this.wheels = c.wheels;
    this.gate = c.gate;
    this.local = {} as Record<MaterialId, Matrix4[]>;
    this.base = {} as Record<MaterialId, number>;
    for (const m of MATERIAL_IDS) {
      const t = TEMPLATES[m];
      this.local[m] = t.map((b) => new Matrix4().compose(_v.set(...b.c), _q.setFromEuler(_e.set(0, b.ry ?? 0, b.rz ?? 0, 'YXZ')), _s.set(...b.s)));
      this.base[m] = this.things.alloc(CAP[m] * t.length);
      for (let i = 0; i < CAP[m]; i++) t.forEach((b, k) => this.things.paint(this.base[m] + i * t.length + k, i % 2 && b.alt !== undefined ? b.alt : b.color));
    }
    this.handBase = this.things.alloc(MOST_BOXES);
    this.ropeBase = this.things.alloc(2);
    this.things.paint(this.ropeBase, ROPE);
    this.things.paint(this.ropeBase + 1, ROPE);
    for (let i = this.cart.base + this.cart.n; i < this.things.used; i++) this.things.hide(i);
    this.oxen = new Flock(OX, 2);
    // (another pair than the village's: their own variants and twitches)
    this.oxen.setup(0, 1, 0.37, 1.02);
    this.oxen.setup(1, 0, 0.86, 0.97);
  }

  /** The cart's feet at (x, y, z) (the axle's middle on the ground), heading, pitch (front down), roll, at scale `k`. */
  place(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, k: number): void {
    this.cart.place(x, y, z, yaw, pitch, roll, k);
    this.root.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ')), _s.set(k, k, k));
  }

  /**
   * Every piece of `counts` in its place on the cart (after `place`). `but`: the last piece of that material is not
   * drawn there (it is in his hands, on its way in or out), unless more than `CAP` are on: then its place stays full.
   */
  writeLoad(counts: Materials, but: MaterialId | null = null): void {
    const spots = loadLayout(counts, this.spots);
    for (const s of spots) {
      const slot = this.base[s.m] + s.i * TEMPLATES[s.m].length;
      const n = counts[s.m] ?? 0;
      if (s.m === but && n <= CAP[s.m] && s.i === n - 1) {
        this.things.hide(slot, TEMPLATES[s.m].length);
        continue;
      }
      _mi.copy(this.root).multiply(_m.compose(_v.set(s.x, s.y, s.z), _q.setFromEuler(_e.set(0, s.yaw, 0)), _s.set(1, 1, 1)));
      this.put(s.m, slot, _mi);
    }
    for (const m of MATERIAL_IDS) {
      const want = Math.min(CAP[m], Math.max(0, counts[m] ?? 0));
      // (pieces no longer drawn folded away)
      if (want < this.drawn[m]) this.things.hide(this.base[m] + want * TEMPLATES[m].length, (this.drawn[m] - want) * TEMPLATES[m].length);
      this.drawn[m] = want;
    }
  }

  /** Where piece `i` of `m` lies on the cart for `counts`, on the map (its base's middle; the cart placed), into `out`; false: not drawn. */
  spotOf(counts: Materials, m: MaterialId, i: number, out: Matrix4): boolean {
    const spots = loadLayout(counts, this.spots);
    const s = spots.find((p) => p.m === m && p.i === i);
    if (!s) return false;
    out.copy(this.root).multiply(_m.compose(_v.set(s.x, s.y, s.z), _q.setFromEuler(_e.set(0, s.yaw, 0)), _s.set(1, 1, 1)));
    return true;
  }

  /** A piece of `m` in his hands at `world` (its base's middle and turn on the map, scaled), or none (null). */
  handItem(m: MaterialId | null, world: Matrix4 | null): void {
    if (this.hand && (m !== this.hand || !world)) this.things.hide(this.handBase, MOST_BOXES);
    this.hand = world ? m : null;
    if (!m || !world) return;
    const t = TEMPLATES[m];
    t.forEach((b, k) => this.things.paint(this.handBase + k, b.color));
    if (t.length < MOST_BOXES) this.things.hide(this.handBase + t.length, MOST_BOXES - t.length);
    this.put(m, this.handBase, world);
  }

  /** The rope from (a) to (b) on the map, sagging `sag` m in its middle; or hidden (null). */
  rope(a: Vector3 | null, b?: Vector3, sag = 0.3): void {
    const i = this.ropeBase;
    if (!a || !b) {
      this.things.hide(i, 2);
      return;
    }
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2 - sag;
    const mz = (a.z + b.z) / 2;
    this.things.segment(i, a.x, a.y, a.z, mx, my, mz, 0.035);
    this.things.segment(i + 1, mx, my, mz, b.x, b.y, b.z, 0.035);
  }

  /** Fold everything away (far off). */
  hide(): void {
    this.cart.hide();
    for (const m of MATERIAL_IDS) {
      if (this.drawn[m]) this.things.hide(this.base[m], this.drawn[m] * TEMPLATES[m].length);
      this.drawn[m] = 0;
    }
    this.handItem(null, null);
    this.rope(null);
    this.oxen.hide(0);
    this.oxen.hide(1);
  }

  private put(m: MaterialId, slot: number, world: Matrix4): void {
    const l = this.local[m];
    for (let k = 0; k < l.length; k++) this.things.set(slot + k, _m.multiplyMatrices(world, l[k]));
  }
}
