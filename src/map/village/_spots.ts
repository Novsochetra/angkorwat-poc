import { LAKES, VILLAGE } from '../layout';

/**
 * Where the floating village's pieces stand (world metres), worked out from
 * the layout (`VILLAGE`: the shore line, the open water) with no three.js:
 * the village part builds from it, and people and festivals can read it
 * (`VILLAGE_SPOTS`) without loading the build.
 *
 * A stilt house stands astride the shore line, its back over the reed
 * shallows (a small deck and a ladder down to the boats) and its front on
 * the beach: a veranda facing the village with a stair down to the ground.
 * Its frame: `x, z` on the shore line, `facing` the way its front looks
 * (radians: toward (sin, cos) in x, z; its local +z).
 */

/** The lake's water level (m). */
export const LAKE_LEVEL = LAKES[0].level;
/** The village ground (m): flat, 1 m over the water (heightfield.ts `layVillage`). */
export const GROUND = LAKE_LEVEL + 1;
/** Rise and run of a stair step (m). */
export const STEP = 0.5;

export type RoofKind = 'thatch' | 'tin' | 'rust' | 'blue';
export type WallKind = 'wood' | 'grey' | 'blue' | 'green' | 'ochre';

/** One house: where it stands, how big and how it looks. */
export interface HomeSpec {
  id: string;
  /** Middle of the floor's footprint (m), on the shore line for a stilt house. */
  x: number;
  z: number;
  /** The way its front (the veranda) looks (radians; its local +z). */
  facing: number;
  /** Across (along the shore) and deep (the closed rooms), veranda depth on the lake side (m). */
  w: number;
  d: number;
  v: number;
  /** Floor top (m). */
  floor: number;
  roof: RoofKind;
  walls: WallKind;
  /** Lit windows at night, smoke from its kitchen, a shop front, a dog on the veranda, laundry, a boat at the ladder. */
  lit: boolean;
  smoke: boolean;
  shop?: boolean;
  dog?: boolean;
  laundry?: boolean;
  boat?: boolean;
  /** A Khmer palm-leaf hat hung on the veranda wall. */
  hat?: boolean;
  seed: number;
}

/** A point on the shore line at arc length `s` (m from its north end): position and the direction along it (unit). */
export function shoreAt(s: number): { x: number; z: number; dx: number; dz: number } {
  const pts = VILLAGE.shore;
  let left = Math.max(0, s);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (left <= len || i === pts.length - 2) {
      const t = Math.min(1, left / len);
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / len, dz: (bz - az) / len };
    }
    left -= len;
  }
  const [x, z] = pts[0];
  return { x, z, dx: 0, dz: 1 };
}

/** The shore's direction smoothed over ±`r` m (round the corners of the line). */
function shoreDir(s: number, r = 5): [number, number] {
  const a = shoreAt(s - r);
  const b = shoreAt(s + r);
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return [(b.x - a.x) / l, (b.z - a.z) / l];
}

/**
 * A frame on the shore at arc length `s`: the point `out` m out over the
 * lake from the line, and the facing (out over the lake: the line's
 * direction turned a quarter to the right, since the lake lies west of it).
 */
function onShore(s: number, out: number): { x: number; z: number; facing: number } {
  const p = shoreAt(s);
  const [dx, dz] = shoreDir(s);
  // (lake side: (−dz, dx))
  const nx = -dz;
  const nz = dx;
  return { x: p.x + nx * out, z: p.z + nz * out, facing: Math.atan2(nx, nz) };
}

type Look = Omit<HomeSpec, 'id' | 'x' | 'z' | 'facing'>;

/** The stilt houses along the shore, north to south: arc length, how far out over the water, and the look. */
const STILT: [number, number, Look][] = [
  [3, 0.5, { w: 6, d: 4.5, v: 2, floor: 9.5, roof: 'thatch', walls: 'grey', lit: true, smoke: false, laundry: true, boat: true, seed: 1 }],
  [11.5, 0, { w: 7, d: 5, v: 2, floor: 10, roof: 'rust', walls: 'blue', lit: true, smoke: true, boat: true, seed: 2 }],
  [20, 1, { w: 6, d: 4.5, v: 2.5, floor: 9.5, roof: 'thatch', walls: 'wood', lit: false, smoke: false, dog: true, hat: true, seed: 3 }],
  [28.5, 0, { w: 6.5, d: 4.5, v: 2, floor: 9.5, roof: 'tin', walls: 'green', lit: true, smoke: true, laundry: true, boat: true, seed: 4 }],
  // (the jetty: arc length 37)
  [46, 0.5, { w: 6, d: 5, v: 2, floor: 10, roof: 'thatch', walls: 'wood', lit: true, smoke: false, boat: true, seed: 5 }],
  [54.5, 0, { w: 7, d: 4.5, v: 2, floor: 9.5, roof: 'rust', walls: 'grey', lit: true, smoke: true, laundry: true, seed: 6 }],
  [63, 1, { w: 6, d: 4.5, v: 2, floor: 10, roof: 'thatch', walls: 'ochre', lit: false, smoke: false, boat: true, hat: true, seed: 7 }],
  [71.5, 0.5, { w: 6.5, d: 5, v: 2, floor: 9.5, roof: 'blue', walls: 'wood', lit: true, smoke: false, laundry: true, seed: 8 }],
  [80, 0, { w: 6, d: 4.5, v: 2.5, floor: 9.5, roof: 'thatch', walls: 'grey', lit: true, smoke: true, boat: true, seed: 9 }],
];

/** The stilt houses (world): their fronts face the land, away from the lake. */
export const STILT_HOMES: HomeSpec[] = STILT.map(([s, out, look], i) => {
  const p = onShore(s, out);
  return { id: `stilt-${i + 1}`, ...p, facing: p.facing + Math.PI, ...look };
});

/** The shop on the land by the trail's end, its front (+z) facing the way down to the jetty. */
export const SHOP_HOME: HomeSpec = {
  id: 'shop',
  x: -288.5,
  z: 72.5,
  facing: -Math.PI / 2 - 0.12,
  w: 6,
  d: 3.5,
  v: 2,
  floor: 7,
  roof: 'rust',
  walls: 'blue',
  lit: true,
  smoke: false,
  shop: true,
  seed: 11,
};

/** The jetty: from the land (`from`, 3 m in from the shore line) out over the water to its head (`to`), deck top `y`. */
export const JETTY = (() => {
  const s = 37;
  const p = shoreAt(s);
  const [dx, dz] = shoreDir(s);
  // Out over the lake, turned a little toward the floating houses (south of west).
  const ox = -dz * 0.8 + dx * 0.25;
  const oz = dx * 0.8 + dz * 0.25;
  const l = Math.hypot(ox, oz);
  const ux = ox / l;
  const uz = oz / l;
  const IN = 3;
  const OUT = 17;
  return {
    from: [p.x - ux * IN, p.z - uz * IN] as [number, number],
    to: [p.x + ux * OUT, p.z + uz * OUT] as [number, number],
    /** Along the jetty (unit, out over the water). */
    dir: [ux, uz] as [number, number],
    y: GROUND + 0.2,
    width: 2.4,
  };
})();

/** A floating house (or raft): middle on the water, facing, raft size (m). */
export interface FloatSpec {
  id: string;
  kind: 'house' | 'shop' | 'garden' | 'cage';
  x: number;
  z: number;
  facing: number;
  /** Raft across and deep (m). */
  w: number;
  d: number;
  roof: RoofKind;
  walls: WallKind;
  lit: boolean;
  smoke: boolean;
  seed: number;
}

/**
 * The floating houses round the open water (`VILLAGE.water`), with channels
 * between them wide enough for a boat; well off the race lane (z 10).
 */
export const FLOATING: FloatSpec[] = (() => {
  const { x: cx, z: cz } = VILLAGE.water;
  const [jx, jz] = JETTY.to;
  const face = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  const list: Omit<FloatSpec, 'facing'>[] = [
    // The floating shop by the jetty's head.
    { id: 'float-shop', kind: 'shop', x: jx - 6, z: jz - 5, w: 7, d: 5.5, roof: 'rust', walls: 'blue', lit: true, smoke: false, seed: 21 },
    { id: 'float-1', kind: 'house', x: cx - 13, z: cz - 4, w: 7, d: 5.5, roof: 'thatch', walls: 'wood', lit: true, smoke: true, seed: 22 },
    { id: 'float-2', kind: 'house', x: cx - 2, z: cz - 15, w: 6.5, d: 5, roof: 'tin', walls: 'green', lit: true, smoke: false, seed: 23 },
    { id: 'float-3', kind: 'house', x: cx - 8, z: cz + 11, w: 6.5, d: 5.5, roof: 'blue', walls: 'grey', lit: false, smoke: false, seed: 24 },
    { id: 'float-4', kind: 'house', x: cx + 10, z: cz - 19, w: 6, d: 5, roof: 'thatch', walls: 'ochre', lit: true, smoke: false, seed: 25 },
    { id: 'float-garden', kind: 'garden', x: cx + 1, z: cz - 1, w: 6, d: 4.5, roof: 'thatch', walls: 'wood', lit: false, smoke: false, seed: 26 },
    { id: 'float-cage', kind: 'cage', x: cx - 18, z: cz - 18, w: 7, d: 7, roof: 'thatch', walls: 'wood', lit: false, smoke: false, seed: 27 },
  ];
  // Each faces the middle of the open water, the shop faces the jetty's head.
  return list.map((f) => ({ ...f, facing: f.kind === 'shop' ? face(f.x, f.z, jx, jz) : face(f.x, f.z, cx + 6, cz + 10) }));
})();

/** The pagoda (wat) on the rise south of the village, facing north over it to the lake. */
export const PAGODA = {
  /** The hall's axis (x) and middle (z). */
  x: -306,
  z: 105.5,
  /** Terrace top (m) and its extent. */
  terrace: { y: 9, x0: -318, x1: -294, z0: 92, z1: 116 },
  /** The hall's plinth top (m). */
  floor: 10,
  /** The naga stair down from the terrace's north edge to the village ground. */
  stair: { x0: -308.5, x1: -303.5, z0: 86, z1: 92 },
  /** The hall's front (north) wall line (z) and door width (m). */
  doorZ: 99,
};

/**
 * Spots for people, festivals and the explorer (world m, [x, y, z]):
 * the pagoda's door (on the porch floor, just outside it) and the foot of
 * its naga stair, the jetty's land end and head, and every home: its door
 * (floor height) and the foot of its stair (ground), facing out over the lake.
 */
export const VILLAGE_SPOTS = {
  pagodaDoor: [PAGODA.x, PAGODA.floor, PAGODA.doorZ - 0.4] as [number, number, number],
  pagodaStairFoot: [PAGODA.x, GROUND, PAGODA.stair.z0 - 1] as [number, number, number],
  jetty: [JETTY.to[0], JETTY.y, JETTY.to[1]] as [number, number, number],
  jettyFoot: [JETTY.from[0], GROUND, JETTY.from[1]] as [number, number, number],
  homes: [...STILT_HOMES, SHOP_HOME].map((h) => ({ id: h.id, ...homePoints(h) })),
  floating: FLOATING.filter((f) => f.kind === 'house' || f.kind === 'shop').map((f) => ({ id: f.id, x: f.x, y: LAKE_LEVEL + 0.5, z: f.z, facing: f.facing })),
};

/** A home's door (on the veranda, before the front door), the foot of its stair (on the ground), and its facing. */
export function homePoints(h: HomeSpec): { door: [number, number, number]; stairFoot: [number, number, number]; facing: number } {
  const st = frontStair(h);
  const zw = -(h.d + h.v) / 2 + h.d;
  const [dx, dz] = homeToWorld(h, 0, zw + 0.5);
  const [fx, fz] = homeToWorld(h, st.x, st.footZ);
  return { door: [dx, h.floor, dz], stairFoot: [fx, GROUND, fz], facing: h.facing };
}

/** A house's local metres (x across, +z its front) → world (x, z). */
export function homeToWorld(h: HomeSpec, lx: number, lz: number): [number, number] {
  const s = Math.sin(h.facing);
  const c = Math.cos(h.facing);
  return [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
}

/**
 * The front stair of a house (local m): straight down from a gap in the
 * veranda's railing (at `x`, `width` wide) to the ground in front, a 0.5 m
 * step each 0.5 m; `steps` rises, the foot at `footZ`.
 */
export function frontStair(h: HomeSpec): { x: number; width: number; steps: number; zf: number; footZ: number } {
  const zf = (h.d + h.v) / 2;
  const steps = Math.round((h.floor - GROUND) / STEP);
  return { x: h.shop ? 0 : h.w / 2 - 1.3, width: h.shop ? 2.4 : 1.2, steps, zf, footZ: zf + (steps - 1) * STEP + 0.6 };
}
