import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  LOD,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  dress,
  statueMaterial,
  type Finish,
  type Palette,
  type SacredLamp,
} from "./finish";
import { meshSculpt, Sculpt, type SculptMesh } from "./sculpt";
import {
  capsule,
  cone,
  displace,
  ellipsoid,
  rot,
  roundBox,
  sphere,
  torus,
  union,
  type Shape,
  type V3,
} from "./sdf";

/**
 * The offerings of a Cambodian altar, made like the Buddhas (sculpt.ts,
 * finish.ts): smooth sculpted brass, wax, lacquer and fruit, and thin
 * things (lotus petals, folded banana leaves, parasol cloth, incense
 * sticks) as plain sheets in the same material. A wax candle on its brass
 * stick, a brass incense urn with red sticks, lotus in a vase, the
 * banana-leaf bay sei, a footed tray of fruit, a marigold garland, the
 * tiered parasol (chhatr) and a monk's alms bowl.
 *
 *   const c = offering('candle');          // or candle({ wax: 'white' })
 *   c.object.position.set(x, y, z);        // stands on y = 0, faces +z
 *   parent.add(c.object);
 *   c.object.updateWorldMatrix(true, false);
 *   for (const f of c.flames) SACRED_LAMPS.push(candleLamp(c.object.localToWorld(f.clone())));
 *
 * Every maker gives an `OfferingPiece`: an Object3D in real metres on
 * y = 0 at its origin (a near and a far mesh, hidden far off), and its
 * candle flames and incense embers in its own space. Each kind is made
 * once and shared: place as many copies as you like.
 *
 * The tools at the end (`lathe`, `crown`, `sheet`, `revolve`,
 * `finishGeometry`) serve stupa.ts too.
 */

export type OfferingKind =
  | "candle"
  | "incense"
  | "lotusVase"
  | "baySei"
  | "fruitPlate"
  | "marigold"
  | "parasol"
  | "alms";

/** Every kind, in altar order. */
export const OFFERING_KINDS: readonly OfferingKind[] = [
  "candle",
  "incense",
  "lotusVase",
  "baySei",
  "fruitPlate",
  "marigold",
  "parasol",
  "alms",
];

/** What an offering maker gives. */
export interface OfferingPiece {
  /** The offering: on y = 0 at its origin, front +z, real metres. */
  object: Object3D;
  /**
   * Candle flames' middles in the object's space (m): turn each into a
   * lamp once the object is placed (`candleLamp(object.localToWorld(p.clone()))`).
   */
  flames: Vector3[];
  /** Glowing incense tips in the object's space (m): where the smoke rises. */
  embers: Vector3[];
  /** Width and height (m), to frame or space it. */
  size: [number, number];
}

/** Options every kind takes. */
export interface OfferingBase {
  /** Uniform scale (1 = real size). */
  scale?: number;
  /** Past this distance (m) the far mesh shows (default ~6 m, by size). */
  near?: number;
  /** Past this distance (m) it is hidden (default 45 m, by size). */
  hide?: number;
}

export interface CandleOptions extends OfferingBase {
  /** Beeswax yellow (the pagoda's) or white. */
  wax?: "yellow" | "white";
  /** A flame on the wick (default yes). */
  lit?: boolean;
}

export interface IncenseOptions extends OfferingBase {
  /** Lit sticks standing in the sand (default 7; old burnt stubs are always there). */
  sticks?: number;
  /** Glowing tips (default yes). */
  lit?: boolean;
}

export interface GarlandOptions extends OfferingBase {
  /** The garland's two ends in the object's space (m); default a 0.8 m swag. */
  from?: V3;
  to?: V3;
  /** How far the middle sags below the ends' line (m, default 0.12). */
  sag?: number;
  /** Changes which heads are yellow and which orange. */
  seed?: number;
}

export interface ParasolOptions extends OfferingBase {
  /** Height from the stand's foot to the finial's tip (m, default 2.2). */
  height?: number;
  /** 5 or 7 tiers (default 7). */
  tiers?: 5 | 7;
  /** White cloth with gold trims, or gold cloth (default white). */
  look?: "white" | "gold";
}

export interface BaySeiOptions extends OfferingBase {
  /** Tiers of folded leaves: 3, 5 or 7 (default 5). */
  tiers?: 3 | 5 | 7;
}

/** Options by kind (for `offering`). */
export interface OfferingOptionsByKind {
  candle: CandleOptions;
  incense: IncenseOptions;
  lotusVase: OfferingBase;
  baySei: BaySeiOptions;
  fruitPlate: OfferingBase;
  marigold: GarlandOptions;
  parasol: ParasolOptions;
  alms: OfferingBase;
}

/** An offering of any kind (see each kind's own maker for what it is). */
export function offering<K extends OfferingKind>(
  kind: K,
  opts?: OfferingOptionsByKind[K],
): OfferingPiece {
  const o = (opts ?? {}) as never;
  switch (kind) {
    case "candle":
      return candle(o);
    case "incense":
      return incenseUrn(o);
    case "lotusVase":
      return lotusVase(o);
    case "baySei":
      return baySei(o);
    case "fruitPlate":
      return fruitPlate(o);
    case "marigold":
      return marigoldGarland(o);
    case "parasol":
      return parasol(o);
    default:
      return almsBowl(o);
  }
}

/**
 * A candle flame's lamp for `SACRED_LAMPS` (finish.ts), at the flame's
 * world position: warm, 2.5 m reach, a third as strong by day (candles
 * burn all day in a pagoda).
 */
export function candleLamp(world: Vector3, strength = 1): SacredLamp {
  return {
    x: world.x,
    y: world.y,
    z: world.z,
    range: 2.5,
    color: [1.5 * strength, 0.85 * strength, 0.38 * strength],
    day: 0.35,
  };
}

// ── Colours ───────────────────────────────────────────────────────────────

/** Surfaces of the offerings (the sculpts' region names are these names). */
export const OFFERING_FINISH = {
  brass: { color: 0xc99a45, metal: 0.9, rough: 0.3, grain: 0.35 },
  brassDark: { color: 0x9c7430, metal: 0.85, rough: 0.42, grain: 0.5 },
  waxYellow: { color: 0xf0c254, metal: 0, rough: 0.42, grain: 0.12 },
  waxWhite: { color: 0xf2ead8, metal: 0, rough: 0.45, grain: 0.1 },
  sand: { color: 0xb3a58c, metal: 0, rough: 0.97, grain: 1 },
  stickRed: { color: 0xc4302a, metal: 0, rough: 0.6, grain: 0 },
  stickBody: { color: 0x7c3a26, metal: 0, rough: 0.85, grain: 0 },
  ash: { color: 0x9a948c, metal: 0, rough: 1, grain: 0 },
  petalBase: { color: 0xf6e2e2, metal: 0, rough: 0.55, grain: 0.15 },
  petal: { color: 0xec94ad, metal: 0, rough: 0.55, grain: 0.15 },
  petalTip: { color: 0xcf3f6c, metal: 0, rough: 0.55, grain: 0.15 },
  openBase: { color: 0xfaeeee, metal: 0, rough: 0.5, grain: 0.12 },
  openTip: { color: 0xe77a9c, metal: 0, rough: 0.5, grain: 0.12 },
  stem: { color: 0x5d7f31, metal: 0, rough: 0.6, grain: 0.2 },
  pod: { color: 0xc9c25a, metal: 0, rough: 0.6, grain: 0.4 },
  stamen: { color: 0xf2b830, metal: 0, rough: 0.6, grain: 0.5 },
  leaf: { color: 0x6aa23a, metal: 0, rough: 0.42, grain: 0.35 },
  leafLight: { color: 0x9cc85c, metal: 0, rough: 0.42, grain: 0.35 },
  leafDark: { color: 0x3f7424, metal: 0, rough: 0.5, grain: 0.35 },
  leafBack: { color: 0x8aae62, metal: 0, rough: 0.65, grain: 0.3 },
  jasmine: { color: 0xf6f3e8, metal: 0, rough: 0.6, grain: 0.3 },
  marigold: { color: 0xf0901c, metal: 0, rough: 0.75, grain: 0.9 },
  banana: { color: 0xf0c83a, metal: 0, rough: 0.5, grain: 0.3 },
  bananaTip: { color: 0x3a3020, metal: 0, rough: 0.7, grain: 0.2 },
  stalk: { color: 0x7d8a3a, metal: 0, rough: 0.7, grain: 0.4 },
  orange: { color: 0xe8871e, metal: 0, rough: 0.55, grain: 0.7 },
  calyx: { color: 0x51652a, metal: 0, rough: 0.7, grain: 0.3 },
  mango: { color: 0xf2b43a, metal: 0, rough: 0.45, grain: 0.25 },
  mangoBlush: { color: 0xd8702c, metal: 0, rough: 0.45, grain: 0.25 },
  mangoGreen: { color: 0x9aa43c, metal: 0, rough: 0.45, grain: 0.25 },
  lacquer: { color: 0x15110e, metal: 0.15, rough: 0.16, grain: 0.05 },
  cloth: { color: 0xf8f5ee, metal: 0, rough: 0.8, grain: 0.35 },
  clothGold: { color: 0xdcae48, metal: 0.55, rough: 0.42, grain: 0.4 },
  gold: { color: 0xe0ac48, metal: 0.92, rough: 0.26, grain: 0.3 },
  lacquerRed: { color: 0x7a1f1a, metal: 0.05, rough: 0.4, grain: 0.3 },
  wick: { color: 0x2a1e16, metal: 0, rough: 0.9, grain: 0 },
} satisfies Record<string, Finish>;

const F = OFFERING_FINISH;

/** The palette the offering sculpts are dressed in (their regions are finish names). */
const PALETTE: Palette = { "*": F.brass, ...F };

// ── Made once, shared ─────────────────────────────────────────────────────

/** Near (up close) or far (a coarser mesh, past `near` m). */
type Detail = "near" | "far";
/** The far mesh's grid, in near cells. */
const FAR = 2.0;

interface Build {
  s: Sculpt;
  cell: number;
  fineCell?: number;
}

const builds = new Map<string, Build>();
const meshes = new Map<string, SculptMesh>();
const made = new Map<string, unknown>();

/** A sculpt's mesh at a detail (sculpted on first use, then shared). */
function sculpted(key: string, detail: Detail, build: () => Build): SculptMesh {
  const k = `${key}/${detail}`;
  let m = meshes.get(k);
  if (!m) {
    let b = builds.get(key);
    if (!b) builds.set(key, (b = build()));
    m = meshSculpt(
      b.s,
      detail === "near"
        ? { cell: b.cell, fineCell: b.fineCell }
        : { cell: b.cell * FAR },
    );
    meshes.set(k, m);
    // (both meshes made: the sculpt is no longer needed)
    if (meshes.has(`${key}/near`) && meshes.has(`${key}/far`))
      builds.delete(key);
    console.info(
      `[sacred] offering ${k}: ${(m.geometry.getIndex()!.count / 3) | 0} triangles in ${m.ms.toFixed(0)} ms`,
    );
  }
  return m;
}

/** A sculpt dressed in the offerings' palette (or `palette`), ready to merge. */
function dressed(
  key: string,
  detail: Detail,
  build: () => Build,
  palette: Palette = PALETTE,
): BufferGeometry {
  return plainAttributes(dress(sculpted(key, detail, build), palette).clone());
}

/** Anything made once and shared under `key`. */
function shared<T>(key: string, make: () => T): T {
  if (!made.has(key)) made.set(key, make());
  return made.get(key) as T;
}

/** Sculpt stats for checks: each sculpted mesh so far, its triangles and time (ms). */
export function offeringStats(): {
  key: string;
  triangles: number;
  ms: number;
}[] {
  return [...meshes].map(([key, m]) => ({
    key,
    triangles: (m.geometry.getIndex()!.count / 3) | 0,
    ms: m.ms,
  }));
}

/** One mesh in the statue material, casting and taking shadows. */
function statueMesh(g: BufferGeometry): Mesh {
  const m = new Mesh(g, statueMaterial());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * The piece: a near and a far level (each made by `level`), hidden past
 * `hide`, scaled; flames and embers scaled into the piece's space.
 */
function piece(
  name: string,
  o: OfferingBase,
  size: [number, number],
  level: (d: Detail) => Object3D,
  flames: Vector3[] = [],
  embers: Vector3[] = [],
): OfferingPiece {
  const k = o.scale ?? 1;
  const reach = Math.max(1, Math.max(size[0], size[1]) * k * 2.5);
  const lod = new LOD();
  lod.name = name;
  lod.addLevel(level("near"), 0);
  lod.addLevel(level("far"), o.near ?? 6 * reach);
  lod.addLevel(new Object3D(), o.hide ?? 45 * reach);
  lod.scale.setScalar(k);
  const object = new Group();
  object.name = name;
  object.add(lod);
  return {
    object,
    flames: flames.map((p) => p.clone().multiplyScalar(k)),
    embers: embers.map((p) => p.clone().multiplyScalar(k)),
    size: [size[0] * k, size[1] * k],
  };
}

/** One merged geometry per key and detail from parts (sculpted and plain). */
function merged(
  key: string,
  detail: Detail,
  parts: () => BufferGeometry[],
): BufferGeometry {
  return shared(`${key}/${detail}`, () =>
    mergeGeometries(parts().map(plainAttributes)),
  );
}

/** A small deterministic hash in 0‥1. */
export function hash(a: number, b = 0, c = 0): number {
  let n =
    (Math.imul(a | 0, 374761393) +
      Math.imul(b | 0, 668265263) +
      Math.imul(c | 0, 2147483647)) |
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** A matrix: move to `at`, turn +y onto `dir`, scale `k`. */
function frame(at: Vector3, dir: Vector3, k = 1, spin = 0): Matrix4 {
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    dir.clone().normalize(),
  );
  q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spin));
  return new Matrix4().compose(at, q, new Vector3(k, k, k));
}

// ── Candle ────────────────────────────────────────────────────────────────

const CANDLE_TOP = 0.2555;

function buildCandle(): Build {
  const s = new Sculpt();
  // The brass stick: a domed foot, a knop on the stem, a drip pan with a rim and the socket.
  s.add(
    lathe(
      [
        [0, 0],
        [0.041, 0],
        [0.043, 0.004],
        [0.037, 0.01],
        [0.022, 0.017],
        [0.01, 0.023],
        [0.0075, 0.029],
        [0.0125, 0.033],
        [0.0125, 0.037],
        [0.0075, 0.041],
        [0.0075, 0.049],
        [0.029, 0.052],
        [0.033, 0.058],
        [0.03, 0.06],
        [0.021, 0.0575],
        [0.019, 0.06],
        [0.019, 0.071],
        [0.016, 0.071],
        [0.016, 0.066],
        [0, 0.066],
      ],
      { round: 0.0015 },
    ),
    "brass",
  );
  // The wax: a column melted hollow at the top, its rim uneven.
  const wax = lathe(
    [
      [0, 0.066],
      [0.0158, 0.066],
      [0.0158, 0.25],
      [0.0164, 0.2555],
      [0.0152, 0.2585],
      [0.012, 0.2575],
      [0.006, 0.2545],
      [0, 0.2538],
    ],
    { round: 0.0008 },
  );
  s.add(
    displace(
      wax,
      (x, y, z) =>
        smooth01((y - 0.24) / 0.012) * vnoise(x * 260 + 3, y * 90, z * 260),
      0.0012,
    ),
    "waxYellow",
  );
  // Drips down the side, one reaching the pan, and the pool it left there.
  const drips: Shape[] = [];
  const DRIP = [
    [1.9, 0.19],
    [0.9, 0.05],
    [2.9, 0.028],
    [0.1, 0.085],
    [4.2, 0.02],
    [5.2, 0.06],
  ];
  for (const [a, len] of DRIP) {
    const c = Math.cos(a);
    const n = Math.sin(a);
    const top = 0.2575;
    const end = top - len;
    drips.push(
      capsule(
        [c * 0.0152, top, n * 0.0152],
        [c * 0.0154, end, n * 0.0154],
        0.0034,
      ),
    );
    drips.push(sphere([c * 0.016, end, n * 0.016], 0.0042));
  }
  s.add(union(drips, 0.002), "waxYellow", 0.0025);
  s.add(
    ellipsoid(
      [Math.cos(1.9) * 0.022, 0.0585, Math.sin(1.9) * 0.022],
      [0.011, 0.0025, 0.011],
    ),
    "waxYellow",
    0.004,
  );
  s.fine([-0.024, 0.215, -0.024, 0.024, 0.266, 0.024]);
  return { s, cell: 0.005, fineCell: 0.003 };
}

let flameMats: [MeshBasicMaterial, MeshBasicMaterial] | null = null;

/** A candle flame `height` m tall, its foot at the origin: a bright core in a warm teardrop, glowing on its own (not lit). */
export function candleFlame(height = 0.036): Object3D {
  flameMats ??= [
    new MeshBasicMaterial({
      color: 0xffa838,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
    new MeshBasicMaterial({ color: 0xfff1c2 }),
  ];
  const geo = shared("flame", () => {
    const pts = [
      [0, 0],
      [0.1, 0.06],
      [0.17, 0.18],
      [0.19, 0.3],
      [0.16, 0.48],
      [0.1, 0.68],
      [0.04, 0.88],
      [0, 1],
    ].map(([r, y]) => new Vector2(r, y));
    return new LatheGeometry(pts, 12);
  });
  const g = new Group();
  g.name = "flame";
  const outer = new Mesh(geo, flameMats[0]);
  outer.scale.setScalar(height);
  outer.renderOrder = 2;
  const core = new Mesh(geo, flameMats[1]);
  core.scale.set(height * 0.55, height * 0.5, height * 0.55);
  core.position.y = height * 0.04;
  g.add(outer, core);
  return g;
}

/**
 * An altar candle: a beeswax-yellow (or white) candle 19 cm tall, melted
 * and dripping, in a brass stick 7 cm high; its flame on the wick
 * (`flames[0]`).
 */
export function candle(o: CandleOptions = {}): OfferingPiece {
  const look = o.wax ?? "yellow";
  const lit = o.lit ?? true;
  const palette: Palette =
    look === "white" ? { ...PALETTE, waxYellow: F.waxWhite } : PALETTE;
  const flame = new Vector3(0, CANDLE_TOP + 0.006 + 0.014, 0);
  return piece(
    "candle",
    o,
    [0.086, 0.3],
    (d) => {
      const g = new Group();
      g.add(
        statueMesh(
          merged(`candle:${look}`, d, () => {
            const wick = new CylinderGeometry(
              0.0008,
              0.001,
              0.011,
              5,
            ).translate(0, 0.0055, 0);
            wick.applyMatrix4(
              new Matrix4()
                .makeRotationZ(0.12)
                .setPosition(0, CANDLE_TOP - 0.001, 0),
            );
            return [
              dressed("candle", d, buildCandle, palette),
              finishGeometry(wick, F.wick),
            ];
          }),
        ),
      );
      if (lit) {
        const f = candleFlame(0.036);
        f.position.set(-0.0012, CANDLE_TOP + 0.006, 0);
        g.add(f);
      }
      return g;
    },
    lit ? [flame] : [],
  );
}

// ── Incense urn ───────────────────────────────────────────────────────────

const SAND_TOP = 0.13;

/** The urn's profile ([r, y] m, foot to axis inside). */
const URN: [number, number][] = [
  [0, 0.016],
  [0.03, 0.016],
  [0.05, 0.02],
  [0.068, 0.031],
  [0.08, 0.048],
  [0.085, 0.066],
  [0.082, 0.084],
  [0.072, 0.099],
  [0.064, 0.107],
  [0.0625, 0.113],
  [0.07, 0.12],
  [0.079, 0.126],
  [0.0905, 0.1305],
  [0.092, 0.1365],
  [0.087, 0.1412],
  [0.077, 0.1395],
  [0.0705, 0.131],
  [0.069, 0.122],
  [0, 0.118],
];

function buildIncense(): Build {
  const s = new Sculpt();
  // The round brass belly, the neck and the flared lip, filled with sand.
  s.add(lathe(URN, { round: 0.002 }), "brass");
  // A band of lotus petals round the lower belly.
  s.add(
    crown({
      y0: 0.024,
      y1: 0.034,
      r0: 0,
      r1: 0,
      radiusAt: profileRadius(URN, 0.0018),
      n: 14,
      tip: 0.022,
      shape: 0.62,
      bulge: 0.0018,
    }),
    "brass",
    0.0015,
  );
  // Three bun feet: one behind, two in front.
  const feet: Shape[] = [];
  for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
    const x = Math.cos(a) * 0.052;
    const z = Math.sin(a) * 0.052;
    feet.push(ellipsoid([x, 0.012, z], [0.013, 0.012, 0.013]));
    feet.push(capsule([x, 0.016, z], [x * 0.8, 0.026, z * 0.8], 0.009));
  }
  s.add(union(feet, 0.004), "brassDark", 0.006);
  // Lugs for the ring handles.
  for (const sx of [-1, 1])
    s.add(
      ellipsoid([sx * 0.074, 0.1, 0], [0.008, 0.007, 0.006]),
      "brassDark",
      0.004,
    );
  // The sand, heaped a little and rough.
  const sand = lathe(
    [
      [0, 0.116],
      [0.0708, 0.116],
      [0.0712, 0.1275],
      [0.045, SAND_TOP - 0.0012],
      [0, SAND_TOP + 0.0005],
    ],
    { round: 0.002 },
  );
  s.add(
    displace(
      sand,
      (x, y, z) =>
        vnoise(x * 140, y * 140, z * 140) * 0.7 +
        vnoise(x * 420, 3, z * 420) * 0.3,
      0.0018,
    ),
    "sand",
  );
  return { s, cell: 0.0068 };
}

/** One stick as plain cylinders: its red handle, the incense (unless burnt down), the ash. */
function stickParts(
  from: Vector3,
  dir: Vector3,
  len: number,
  handle: number,
  burnt: boolean,
): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
  const part = (a: number, b: number, r: number, f: Finish) => {
    const g = new CylinderGeometry(r, r, b - a, 5, 1);
    g.translate(0, (a + b) / 2, 0);
    g.applyQuaternion(q);
    g.translate(from.x, from.y, from.z);
    out.push(finishGeometry(g, f));
  };
  part(-0.02, handle, 0.0014, F.stickRed);
  if (!burnt) {
    part(handle, len - 0.006, 0.0019, F.stickBody);
    part(len - 0.006, len, 0.0017, F.ash);
  }
  return out;
}

/** The sticks in the urn: `n` lit ones fanned in a bunch, old red stubs round them; and the lit tips. */
function incenseSticks(n: number): {
  parts: BufferGeometry[];
  tips: Vector3[];
} {
  const parts: BufferGeometry[] = [];
  const tips: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + 0.4;
    const r = 0.004 + 0.011 * Math.sqrt((i + 0.5) / n);
    const from = new Vector3(
      Math.cos(a) * r,
      SAND_TOP - 0.002,
      Math.sin(a) * r,
    );
    const lean = 0.05 + 0.1 * hash(i, 3);
    const dir = new Vector3(
      Math.cos(a) * lean,
      1,
      Math.sin(a) * lean,
    ).normalize();
    const len = 0.25 + 0.04 * hash(i, 5);
    parts.push(...stickParts(from, dir, len, 0.05, false));
    tips.push(from.clone().addScaledVector(dir, len + 0.001));
  }
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996 + 1.3;
    const r = 0.022 + 0.034 * Math.sqrt(hash(i, 7));
    const from = new Vector3(
      Math.cos(a) * r,
      SAND_TOP - 0.003,
      Math.sin(a) * r,
    );
    const lean = 0.25 * (hash(i, 9) - 0.5);
    const dir = new Vector3(
      Math.cos(a * 1.7) * lean,
      1,
      Math.sin(a * 1.7) * lean,
    ).normalize();
    parts.push(...stickParts(from, dir, 0, 0.02 + 0.03 * hash(i, 11), true));
  }
  return { parts, tips };
}

let ember: MeshBasicMaterial | null = null;

/**
 * A brass incense urn (13.5 cm high, 17 cm across): a round belly with a
 * band of lotus petals, a flared lip, two ring handles, three bun feet,
 * filled with sand; red incense sticks stand in it among old burnt stubs,
 * their tips glowing (`embers`).
 */
export function incenseUrn(o: IncenseOptions = {}): OfferingPiece {
  const n = o.sticks ?? 7;
  const lit = o.lit ?? true;
  const { tips } = shared(`sticks:${n}`, () => incenseSticks(n));
  return piece(
    "incense",
    o,
    [0.19, 0.42],
    (d) => {
      const g = new Group();
      g.add(
        statueMesh(
          merged(`incense:${n}`, d, () => {
            const rings = [-1, 1].map((sx) =>
              finishGeometry(
                new TorusGeometry(0.016, 0.0028, 6, 18).translate(
                  sx * 0.086,
                  0.094,
                  0,
                ),
                F.brass,
              ),
            );
            return [
              dressed("incense", d, buildIncense),
              ...rings,
              ...incenseSticks(n).parts,
            ];
          }),
        ),
      );
      if (lit) {
        ember ??= new MeshBasicMaterial({ color: 0xff5a1c });
        g.add(
          new Mesh(
            shared(`embers:${n}`, () =>
              mergeGeometries(
                tips.map((t) =>
                  new SphereGeometry(0.0023, 6, 4).translate(t.x, t.y, t.z),
                ),
              ),
            ),
            ember,
          ),
        );
      }
      return g;
    },
    [],
    lit ? tips : [],
  );
}

// ── Lotus ─────────────────────────────────────────────────────────────────

/** A closed lotus bud, sculpted: foot at the origin, pointing up, 8.5 cm; its petals' edges as shallow ridges. */
function buildBud(): Build {
  const s = new Sculpt();
  const body = union(
    [
      ellipsoid([0, 0.03, 0], [0.019, 0.032, 0.019]),
      cone([0, 0.042, 0], [0, 0.082, 0], 0.0137, 0.0012),
    ],
    0.012,
  );
  s.add(
    displace(
      body,
      (x, _y, z) => Math.sqrt(Math.abs(Math.sin(2.5 * Math.atan2(z, x)))) - 0.6,
      0.0012,
    ),
    "petal",
  );
  s.add(ellipsoid([0, 0.004, 0], [0.009, 0.007, 0.009]), "stem", 0.004);
  s.paint(roundBox([0, 0.078, 0], [0.03, 0.024, 0.03]), "petalTip");
  s.paint(roundBox([0, 0.0, 0], [0.03, 0.012, 0.03]), "petalBase");
  s.paint(ellipsoid([0, 0.004, 0], [0.01, 0.008, 0.01]), "stem");
  return { s, cell: 0.0056 };
}

/** Mix of two finishes (t: 0 → a, 1 → b). */
function mixFinish(a: Finish, b: Finish, t: number): Finish {
  const ca = new Color(a.color);
  return {
    color: ca.lerp(new Color(b.color), t).getHex(),
    metal: a.metal + (b.metal - a.metal) * t,
    rough: a.rough + (b.rough - a.rough) * t,
    grain: (a.grain ?? 0.3) + ((b.grain ?? 0.3) - (a.grain ?? 0.3)) * t,
  };
}

/** A lotus petal's colour along it: pale at the foot, pink, deep pink at the tip. */
function petalLook(v: number): Finish {
  return v < 0.55
    ? mixFinish(F.petalBase, F.petal, v / 0.55)
    : mixFinish(F.petal, F.petalTip, Math.min(1, (v - 0.55) / 0.45) ** 1.5);
}

/** An open flower's petal: nearly white, blushing pink toward the tip. */
function openLook(v: number): Finish {
  return mixFinish(F.openBase, F.openTip, Math.pow(v, 1.8));
}

/**
 * A lotus petal (plain sheet, 1.2 mm thick): foot at the origin, lying
 * along +z, its inner face up; `cup` raises its sides, `curl` its tip.
 */
function petalSheet(
  len: number,
  width: number,
  cup: number,
  curl: number,
  look = petalLook,
): BufferGeometry {
  return sheet(
    3,
    4,
    (u, v) => {
      const w =
        width *
        0.5 *
        Math.max(0.3, Math.pow(Math.sin(Math.PI * Math.pow(v, 0.62)), 0.55));
      const x = (0.5 - u) * 2 * w;
      const e = (2 * u - 1) ** 2;
      return [x, cup * e * w + curl * v * v * len, v * len];
    },
    (_u, v) => ({ f: look(v), occ: 0.7 + 0.3 * v }),
    0.0012,
  );
}

/** An open lotus flower (plain sheets): foot at the origin, facing up, 10 cm across. */
function openLotus(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const ring = (
    n: number,
    off: number,
    rb: number,
    yb: number,
    elev: number,
    len: number,
    width: number,
    cup: number,
  ) => {
    for (let k = 0; k < n; k++) {
      const a = off + (k / n) * Math.PI * 2;
      const g = petalSheet(len, width, cup, 0.1, openLook);
      g.applyMatrix4(new Matrix4().makeRotationX(-elev));
      g.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2 - a));
      g.translate(Math.cos(a) * rb, yb, Math.sin(a) * rb);
      out.push(g);
    }
  };
  ring(7, 0, 0.01, 0.006, 0.6, 0.058, 0.046, 0.42);
  ring(6, 0.45, 0.008, 0.01, 1.05, 0.05, 0.042, 0.5);
  // The seed pod, the stamens round it, the green cup under it all.
  out.push(
    finishGeometry(
      new CylinderGeometry(0.0105, 0.008, 0.012, 14, 1).translate(0, 0.022, 0),
      F.pod,
    ),
  );
  const st = new TorusGeometry(0.0115, 0.0035, 5, 18);
  st.rotateX(Math.PI / 2);
  st.translate(0, 0.019, 0);
  out.push(finishGeometry(st, F.stamen));
  out.push(
    finishGeometry(
      new SphereGeometry(0.011, 10, 6).scale(1, 0.8, 1).translate(0, 0.006, 0),
      F.stem,
    ),
  );
  return out;
}

/** A bud with its outer petals folded back, the Khmer way (the sculpted bud, smaller, and six folded plain petals). */
function foldedPetals(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const g = sheet(
      2,
      4,
      (u, v) => {
        const w = 0.012 * Math.max(0.15, Math.sin(Math.PI * Math.pow(v, 0.75)));
        // Folded in half along its middle: a ridge.
        return [
          (0.5 - u) * 2 * w,
          -Math.abs(2 * u - 1) * w * 0.8 + 0.004 * Math.sin(Math.PI * v),
          v * 0.03,
        ];
      },
      (_u, v) => ({ f: petalLook(0.25 + v * 0.6), occ: 0.65 + 0.35 * v }),
      0.0012,
    );
    g.applyMatrix4(new Matrix4().makeRotationX(0.45));
    g.applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2 - a));
    g.translate(Math.cos(a) * 0.009, 0.014, Math.sin(a) * 0.009);
    out.push(g);
  }
  return out;
}

/** Where the lotus stems go: foot in the vase's neck, head where the flower sits. */
const LOTUS_STEMS: { from: V3; to: V3; kind: "bud" | "folded" | "open" }[] = [
  { from: [0, 0.19, -0.004], to: [0.004, 0.43, -0.02], kind: "bud" },
  { from: [-0.008, 0.19, 0], to: [-0.058, 0.4, -0.012], kind: "bud" },
  { from: [0.008, 0.19, 0], to: [0.06, 0.395, -0.004], kind: "bud" },
  { from: [-0.004, 0.19, 0.006], to: [-0.03, 0.36, 0.05], kind: "folded" },
  { from: [0.004, 0.19, 0.006], to: [0.032, 0.35, 0.055], kind: "folded" },
  { from: [-0.01, 0.19, 0.004], to: [-0.1, 0.3, 0.05], kind: "open" },
  { from: [0.01, 0.19, 0.004], to: [0.1, 0.29, 0.06], kind: "open" },
];

/** A stem from `from` to `to`, bowing outward a little: its points and its direction at the head. */
function stemCurve(from: V3, to: V3): { pts: Vector3[]; dir: Vector3 } {
  const a = new Vector3(...from);
  const b = new Vector3(...to);
  const mid = a.clone().lerp(b, 0.5);
  mid.y += 0.02;
  mid.x += (b.x - a.x) * 0.15;
  mid.z += (b.z - a.z) * 0.15;
  const pts: Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(
      a
        .clone()
        .multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(mid, 2 * t * (1 - t))
        .addScaledVector(b, t * t),
    );
  }
  return { pts, dir: pts[8].clone().sub(pts[7]).normalize() };
}

/** The vase's profile ([r, y] m). */
const VASE: [number, number][] = [
  [0, 0],
  [0.04, 0],
  [0.042, 0.005],
  [0.034, 0.012],
  [0.028, 0.02],
  [0.034, 0.03],
  [0.056, 0.05],
  [0.066, 0.08],
  [0.062, 0.11],
  [0.046, 0.14],
  [0.03, 0.162],
  [0.027, 0.178],
  [0.031, 0.19],
  [0.045, 0.206],
  [0.046, 0.211],
  [0.04, 0.211],
  [0.024, 0.196],
  [0, 0.19],
];

function buildVase(): Build {
  const s = new Sculpt();
  // A brass vase: a ring foot, a round belly with a band of lotus petals, a slim neck, a flared lip.
  s.add(lathe(VASE, { round: 0.002 }), "brass");
  s.add(torus([0, 0.162, 0], 0.031, 0.0032), "brassDark", 0.002);
  s.add(
    crown({
      y0: 0.05,
      y1: 0.06,
      r0: 0,
      r1: 0,
      radiusAt: profileRadius(VASE, 0.0018),
      n: 12,
      tip: 0.026,
      shape: 0.62,
      bulge: 0.0018,
    }),
    "brass",
    0.0015,
  );
  return { s, cell: 0.0085 };
}

/** A lotus leaf (plain sheet: it is thin): a cupped round pad with its notch, its rim waved, pale beneath. */
function lotusLeaf(radius: number, seed: number): BufferGeometry {
  return sheet(
    14,
    3,
    (u, v) => {
      const a = Math.PI * 2 * (0.03 + 0.94 * u);
      const r = radius * v;
      return [
        Math.cos(a) * r,
        0.35 * radius * v * v + v * v * 0.006 * Math.sin(a * 5 + seed * 2),
        Math.sin(a) * r,
      ];
    },
    (_u, v) => ({ f: mixFinish(F.leafLight, F.leaf, v), occ: 0.8 + 0.2 * v }),
    0.0022,
    () => ({ f: F.leafBack, occ: 0.7 }),
  );
}

/**
 * Lotus in a brass vase (21 cm vase, 45 cm with the flowers): three
 * closed pink buds, two buds with their outer petals folded back (as
 * Cambodians fold them for the altar), two open flowers and two leaves.
 */
export function lotusVase(o: OfferingBase = {}): OfferingPiece {
  return piece("lotusVase", o, [0.3, 0.47], (d) =>
    statueMesh(
      merged("lotusVase", d, () => {
        const parts: BufferGeometry[] = [dressed("vase", d, buildVase)];
        const bud = dressed("bud", d, buildBud);
        const open = openLotus();
        const folds = foldedPetals();
        LOTUS_STEMS.forEach(({ from, to, kind }, i) => {
          const { pts, dir } = stemCurve(from, to);
          for (let j = 0; j < 8; j += 2)
            parts.push(
              finishGeometry(
                tubeBetween(pts[j], pts[j + 2], 0.0024, 5),
                F.stem,
              ),
            );
          const head = pts[8];
          // (open flowers turn their faces up to the light)
          if (kind === "open")
            for (const g of open)
              parts.push(
                g
                  .clone()
                  .applyMatrix4(
                    frame(head, dir.clone().add(new Vector3(0, 1.4, 0)), 1, i),
                  ),
              );
          else {
            parts.push(
              bud
                .clone()
                .applyMatrix4(
                  frame(head, dir, kind === "folded" ? 0.72 : 1, i * 1.3),
                ),
            );
            if (kind === "folded")
              for (const g of folds)
                parts.push(g.clone().applyMatrix4(frame(head, dir, 1, i)));
          }
        });
        // Two leaves on their own stems, tipped out behind the flowers.
        const leaves: [V3, V3, number][] = [
          [[-0.006, 0.19, -0.006], [-0.085, 0.29, -0.06], 0.07],
          [[0.006, 0.19, -0.006], [0.09, 0.275, -0.05], 0.06],
        ];
        leaves.forEach(([a, b, r], i) => {
          const A = new Vector3(...a);
          const B = new Vector3(...b);
          parts.push(finishGeometry(tubeBetween(A, B, 0.0026), F.stem));
          const out = B.clone().sub(A).normalize();
          parts.push(
            lotusLeaf(r, i).applyMatrix4(
              frame(B, new Vector3(out.x * 0.9, 1, out.z * 0.9), 1, i),
            ),
          );
        });
        return parts;
      }),
    ),
  );
}

// ── Bay sei ───────────────────────────────────────────────────────────────

/** The bay sei's tiers, bottom first: foot and top (y), radius at the foot and top (m). */
function baySeiTiers(
  tiers: number,
): { y0: number; y1: number; r0: number; r1: number }[] {
  const out: { y0: number; y1: number; r0: number; r1: number }[] = [];
  const foot = 0.13;
  const top = 0.55;
  // Each tier a little shorter and narrower than the one below.
  const hs = Array.from({ length: tiers }, (_, i) => Math.pow(0.86, i));
  const sum = hs.reduce((a, b) => a + b, 0);
  let y = foot;
  let r = 0.098;
  for (let i = 0; i < tiers; i++) {
    const h = ((top - foot) * hs[i]) / sum;
    const r1 = r * 0.78;
    out.push({ y0: y, y1: y + h, r0: r, r1 });
    y += h;
    r = r1 * 0.97;
  }
  return out;
}

function buildPhan(): Build {
  const s = new Sculpt();
  // The footed brass bowl (phan) a bay sei stands in.
  s.add(
    lathe(
      [
        [0, 0],
        [0.074, 0],
        [0.077, 0.006],
        [0.068, 0.014],
        [0.036, 0.028],
        [0.029, 0.048],
        [0.04, 0.06],
        [0.078, 0.078],
        [0.11, 0.1],
        [0.124, 0.116],
        [0.127, 0.122],
        [0.118, 0.124],
        [0.1, 0.12],
        [0, 0.12],
      ],
      { round: 0.002 },
    ),
    "brass",
  );
  s.add(
    crown({
      y0: 0.034,
      y1: 0.041,
      r0: 0.032,
      r1: 0.031,
      n: 8,
      tip: 0.012,
      shape: 0.62,
      bulge: 0.0015,
      flare: 0.3,
    }),
    "brass",
    0.002,
  );
  return { s, cell: 0.0105 };
}

/**
 * A folded banana-leaf point (plain, one-sided): its foot's middle at the
 * origin, rising along +y, facing +z; `bulge` how far its crease stands out.
 */
function leafPoint(
  w: number,
  h: number,
  bulge: number,
  shade: number,
): BufferGeometry {
  return sheet(
    2,
    3,
    (u, v) => {
      const hw = (w / 2) * (1 - Math.pow(v, 1.4));
      const t = 1 - Math.abs(2 * u - 1);
      return [(u - 0.5) * 2 * hw, v * h, bulge * (1 - v) * t];
    },
    (u, v) => ({
      f: mixFinish(
        F.leafDark,
        F.leafLight,
        (1 - Math.abs(2 * u - 1)) * 0.7 + v * 0.3,
      ),
      occ: (0.5 + 0.5 * v) * shade,
    }),
  );
}

/** A ring of leaf points round the axis at height y, radius r; `tilt` leans them in (+) or out (−) from upright; `down` hangs them. */
function leafRing(
  out: BufferGeometry[],
  n: number,
  y: number,
  r: number,
  w: number,
  h: number,
  tilt: number,
  phase: number,
  down = false,
  shade = 1,
): void {
  const pt = leafPoint(w, h, w * 0.22, shade);
  for (let k = 0; k < n; k++) {
    const a = ((k + phase) / n) * Math.PI * 2;
    const m = new Matrix4().makeRotationX(down ? tilt : -tilt);
    if (down) m.multiply(new Matrix4().makeRotationZ(Math.PI));
    m.premultiply(new Matrix4().makeRotationY(Math.PI / 2 - a));
    m.setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
    out.push(pt.clone().applyMatrix4(m));
  }
}

/**
 * A bay sei (បាយសី), the Khmer banana-leaf offering (0.62 m): a cone of
 * folded banana-leaf points in tiers, a string of jasmine buds round each
 * tier, a marigold at its tip, standing in a footed brass bowl with a
 * skirt of big folded leaves over its lip.
 */
export function baySei(o: BaySeiOptions = {}): OfferingPiece {
  const tiers = o.tiers ?? 5;
  return piece("baySei", o, [0.26, 0.62], (d) =>
    statueMesh(
      merged(`baySei:${tiers}`, d, () => {
        const parts: BufferGeometry[] = [dressed("phan", d, buildPhan)];
        const T = baySeiTiers(tiers);
        // The core the leaves are pinned to (dark in their shade).
        const core: RevolvePoint[] = [
          { r: 0, y: T[T.length - 1].y1 + 0.02, f: F.leafDark, occ: 0.5 },
        ];
        for (let i = T.length - 1; i >= 0; i--) {
          core.push({ r: T[i].r1 * 0.8, y: T[i].y1, f: F.leafDark, occ: 0.45 });
          core.push({
            r: T[i].r0 * 0.84,
            y: T[i].y0 + 0.004,
            f: F.leafDark,
            occ: 0.4,
          });
        }
        core.push({ r: 0, y: T[0].y0, f: F.leafDark, occ: 0.4 });
        parts.push(revolve(core, 28));
        // A skirt of big points hanging over the bowl's lip, two rows.
        leafRing(parts, 12, 0.14, 0.1, 0.066, 0.07, -0.5, 0, true, 0.9);
        leafRing(parts, 12, 0.145, 0.094, 0.06, 0.055, -0.35, 0.5, true, 1);
        // Each tier: three rows of folds overlapping like scales, leaning in with the cone, jasmine at its top.
        T.forEach((t, i) => {
          const h = t.y1 - t.y0;
          const slope = Math.atan2(t.r0 - t.r1, h);
          for (let j = 0; j < 3; j++) {
            const f = j / 3;
            const r = t.r0 + (t.r1 - t.r0) * f + (j ? 0.002 : 0.008);
            const n = Math.max(8, Math.round((Math.PI * 2 * r) / 0.03));
            // (the tier's first row flares out: its edge shows)
            leafRing(
              parts,
              n,
              t.y0 + h * f,
              r,
              ((Math.PI * 2 * r) / n) * 1.5,
              h * (j ? 0.5 : 0.56),
              j ? slope - 0.06 : slope - 0.32,
              (i * 3 + j) % 2 ? 0.5 : 0,
              false,
              0.78 + 0.11 * j,
            );
          }
          parts.push(
            beadRing(
              t.r1 + 0.004,
              t.y1 - 0.002,
              0.0072,
              Math.max(10, Math.round((Math.PI * 2 * t.r1) / 0.015)),
              F.jasmine,
            ),
          );
        });
        // The tip: a slim folded-leaf spire, a ring of jasmine, a marigold.
        const top = T[T.length - 1];
        parts.push(
          revolve(
            [
              { r: 0, y: top.y1 + 0.075, f: F.leafLight },
              { r: 0.006, y: top.y1 + 0.05, f: F.leaf },
              { r: top.r1 * 0.75, y: top.y1 - 0.004, f: F.leafDark, occ: 0.7 },
              { r: 0, y: top.y1 - 0.01, f: F.leafDark },
            ],
            12,
          ),
        );
        parts.push(beadRing(0.016, top.y1 + 0.004, 0.005, 9, F.jasmine));
        const head = dressed("marigold", d, buildMarigold);
        parts.push(
          head
            .clone()
            .applyMatrix4(new Matrix4().makeTranslation(0, top.y1 + 0.026, 0)),
        );
        return parts;
      }),
    ),
  );
}

// ── Marigolds ─────────────────────────────────────────────────────────────

/** A marigold's head: a ruffled ball of petals (centre `c`, radius `r`). */
function marigoldHead(c: V3, r: number): Shape {
  const [cx, cy, cz] = c;
  const k = 1 / r;
  return displace(
    ellipsoid(c, [r, r * 0.86, r]),
    (x, y, z) => {
      const u = (x - cx) * k;
      const v = (y - cy) * k;
      const w = (z - cz) * k;
      return (
        0.6 * vnoise(u * 3.2 + 7, v * 3.2, w * 3.2) +
        0.4 *
          Math.sin(Math.atan2(w, u) * 9 + v * 4) *
          Math.sqrt(Math.max(0, 1 - v * v))
      );
    },
    r * 0.13,
  );
}

function buildMarigold(): Build {
  const s = new Sculpt();
  s.add(marigoldHead([0, 0, 0], 0.021), "marigold");
  return { s, cell: 0.0074 };
}

const MARIGOLD_COLOURS = [0xf0901c, 0xf7ad1e, 0xe87a14, 0xf4b82a];

/**
 * A marigold garland (the heads 4 cm, threaded close): orange and yellow
 * heads with a white jasmine bud now and then, sagging between two ends.
 */
export function marigoldGarland(o: GarlandOptions = {}): OfferingPiece {
  const a = new Vector3(...(o.from ?? [-0.4, 0.5, 0]));
  const b = new Vector3(...(o.to ?? [0.4, 0.5, 0]));
  const sag = o.sag ?? 0.12;
  const seed = o.seed ?? 0;
  const at = (t: number) =>
    a
      .clone()
      .lerp(b, t)
      .setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t));
  // The curve's length, to space the heads.
  let len = 0;
  for (let i = 0; i < 32; i++) len += at(i / 32).distanceTo(at((i + 1) / 32));
  const n = Math.max(2, Math.round(len / 0.031));
  const white: Palette = { "*": { ...F.marigold, color: 0xffffff } };
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const mats: Matrix4[] = [];
  const cols: Color[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = at(t);
    const dir = at(Math.min(1, t + 0.01))
      .sub(at(Math.max(0, t - 0.01)))
      .normalize();
    // Threaded through its middle: the head's axis along the string, each turned its own way.
    q.setFromUnitVectors(up, dir);
    q.multiply(new Quaternion().setFromAxisAngle(up, hash(i, seed, 1) * 6.28));
    const jasmine = i % 7 === 3;
    const k = jasmine ? 0.55 : 0.92 + 0.16 * hash(i, seed, 2);
    mats.push(m.compose(p, q, new Vector3(k, k, k)).clone());
    cols.push(
      new Color().setHex(
        jasmine ? 0xf6f2e6 : MARIGOLD_COLOURS[Math.floor(hash(i, seed, 3) * 4)],
        SRGBColorSpace,
      ),
    );
  }
  const cord = merged(`cord:${a.toArray()}:${b.toArray()}`, "near", () => [
    finishGeometry(
      tubeBetween(a.clone().setY(a.y + 0.03), a, 0.0016),
      F.stickRed,
    ),
    finishGeometry(
      tubeBetween(b.clone().setY(b.y + 0.03), b, 0.0016),
      F.stickRed,
    ),
  ]);
  const w = Math.hypot(b.x - a.x, b.z - a.z);
  // (its heads are small: the far ones show from 4 m, whatever its length)
  return piece(
    "marigold",
    { near: 4 * (o.scale ?? 1), hide: 40 * (o.scale ?? 1), ...o },
    [w + 0.05, Math.max(a.y, b.y) + 0.05],
    (d) => {
      const g = new Group();
      const heads = new InstancedMesh(
        shared(`marigold:${d}`, () =>
          dress(sculpted("marigold", d, buildMarigold), white),
        ),
        statueMaterial(),
        mats.length,
      );
      mats.forEach((mm, i) => {
        heads.setMatrixAt(i, mm);
        heads.setColorAt(i, cols[i]);
      });
      heads.computeBoundingSphere();
      heads.castShadow = true;
      heads.receiveShadow = true;
      g.add(heads, statueMesh(cord));
      return g;
    },
  );
}

// ── Fruit on a footed tray ────────────────────────────────────────────────

/** A banana along a gentle curve from `s0` (the stalk end) to `e` (its tip). */
function banana(s0: V3, e: V3, lift: number): { body: Shape; tip: Shape } {
  const segs: Shape[] = [];
  const P = (t: number): V3 => [
    s0[0] + (e[0] - s0[0]) * t,
    s0[1] + (e[1] - s0[1]) * t - lift * 4 * t * (1 - t) + lift * t * t * 2.2,
    s0[2] + (e[2] - s0[2]) * t,
  ];
  const R = (t: number) =>
    0.0065 + 0.0115 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.7;
  const N = 4;
  for (let i = 0; i < N; i++)
    segs.push(cone(P(i / N), P((i + 1) / N), R(i / N), R((i + 1) / N)));
  return { body: union(segs, 0.003), tip: sphere(P(1), 0.0065) };
}

function buildFruitPlate(): Build {
  const s = new Sculpt();
  // A footed brass tray.
  s.add(
    lathe(
      [
        [0, 0],
        [0.058, 0],
        [0.06, 0.005],
        [0.05, 0.012],
        [0.024, 0.026],
        [0.019, 0.042],
        [0.028, 0.048],
        [0.1, 0.051],
        [0.128, 0.058],
        [0.14, 0.066],
        [0.143, 0.0745],
        [0.137, 0.0795],
        [0.126, 0.0765],
        [0.116, 0.0715],
        [0, 0.07],
      ],
      { round: 0.002 },
    ),
    "brass",
  );
  s.add(
    crown({
      y0: 0.034,
      y1: 0.041,
      r0: 0.02,
      r1: 0.021,
      n: 8,
      tip: 0.012,
      shape: 0.62,
      bulge: 0.0015,
      flare: 0.3,
    }),
    "brass",
    0.002,
  );
  // A hand of five bananas across the back, their stalk to the left.
  const bodies: Shape[] = [];
  const tips: Shape[] = [];
  for (let i = 0; i < 5; i++) {
    const z = -0.07 + i * 0.021;
    const y = 0.088 + (i === 2 ? 0.012 : i % 2 ? 0.006 : 0);
    const b = banana(
      [-0.085, y + 0.008, -0.03 + i * 0.006],
      [0.098, y + 0.004, z * 1.05],
      0.012,
    );
    bodies.push(b.body);
    tips.push(b.tip);
  }
  s.add(union(bodies), "banana", 0.002);
  s.add(
    capsule([-0.1, 0.098, -0.02], [-0.084, 0.096, -0.018], 0.011),
    "stalk",
    0.006,
  );
  s.paint(union(tips), "bananaTip");
  s.paint(sphere([-0.098, 0.097, -0.019], 0.016), "stalk");
  // Two oranges and a mango in front.
  const oranges: V3[] = [
    [0.052, 0.105, 0.062],
    [-0.012, 0.105, 0.078],
  ];
  s.add(union(oranges.map((c) => sphere(c, 0.034))), "orange");
  for (const c of oranges)
    s.paint(sphere([c[0], c[1] + 0.034, c[2]], 0.007), "calyx");
  s.add(
    ellipsoid([-0.068, 0.101, 0.052], [0.036, 0.03, 0.052], rot(0.7, 0, 0.12)),
    "mango",
  );
  s.paint(ellipsoid([-0.09, 0.115, 0.03], [0.03, 0.03, 0.035]), "mangoBlush");
  s.paint(sphere([-0.04, 0.1, 0.09], 0.02), "mangoGreen");
  return { s, cell: 0.0088 };
}

/** A footed brass tray (28 cm) of fruit: a hand of bananas, two oranges and a mango. */
export function fruitPlate(o: OfferingBase = {}): OfferingPiece {
  return piece("fruitPlate", o, [0.28, 0.14], (d) =>
    statueMesh(
      merged("fruitPlate", d, () => [
        dressed("fruitPlate", d, buildFruitPlate),
      ]),
    ),
  );
}

// ── Alms bowl ─────────────────────────────────────────────────────────────

function buildAlms(): Build {
  const s = new Sculpt();
  s.add(
    lathe(
      [
        [0, 0.012],
        [0.035, 0.013],
        [0.07, 0.024],
        [0.1, 0.045],
        [0.118, 0.075],
        [0.124, 0.1],
        [0.12, 0.126],
        [0.108, 0.148],
        [0.093, 0.162],
        [0.088, 0.166],
        [0.094, 0.169],
        [0.092, 0.175],
        [0.08, 0.186],
        [0.055, 0.196],
        [0.026, 0.201],
        [0.014, 0.202],
        [0.012, 0.208],
        [0.018, 0.213],
        [0.016, 0.22],
        [0.007, 0.225],
        [0, 0.226],
      ],
      { round: 0.003 },
    ),
    "lacquer",
  );
  s.paint(roundBox([0, 0.217, 0], [0.03, 0.016, 0.03]), "brass");
  // Its ring stand.
  s.add(torus([0, 0.013, 0], 0.066, 0.011), "brassDark", 0.004);
  return { s, cell: 0.0085 };
}

/** A monk's alms bowl (bat, 24 cm across): black lacquer, a domed lid with a brass knob, on its ring stand. */
export function almsBowl(o: OfferingBase = {}): OfferingPiece {
  return piece("alms", o, [0.25, 0.23], (d) =>
    statueMesh(merged("alms", d, () => [dressed("alms", d, buildAlms)])),
  );
}

// ── Parasol (chhatr) ──────────────────────────────────────────────────────

function buildParasolStand(): Build {
  const s = new Sculpt();
  // A small gilt lotus stand on a red lacquered foot, the pole's socket in it.
  s.add(
    lathe(
      [
        [0, 0],
        [0.13, 0],
        [0.132, 0.03],
        [0.12, 0.036],
        [0.1, 0.04],
        [0, 0.04],
      ],
      { round: 0.004 },
    ),
    "lacquerRed",
  );
  s.add(
    crown({
      y0: 0.038,
      y1: 0.07,
      r0: 0.105,
      r1: 0.085,
      n: 12,
      tip: 0.05,
      shape: 0.62,
      bulge: 0.004,
      flare: 0.25,
    }),
    "gold",
    0.004,
  );
  s.add(cone([0, 0.06, 0], [0, 0.16, 0], 0.07, 0.02), "gold", 0.01);
  s.add(torus([0, 0.16, 0], 0.022, 0.008), "gold", 0.004);
  return { s, cell: 0.0115 };
}

/** The tiers of a 2.2 m parasol, bottom first: the height of each canopy's rim and its radius (m). */
function parasolTiers(tiers: number): { y: number; r: number }[] {
  const out: { y: number; r: number }[] = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    out.push({ y: 0.98 + 0.9 * t, r: 0.32 * (1 - 0.6 * t) });
  }
  return out;
}

/** One tier of cloth (plain: cloth is thin): a shallow canopy, a valance with a pointed, gold-trimmed hem. */
function parasolTier(
  y: number,
  r: number,
  look: "white" | "gold",
): BufferGeometry {
  const cloth = look === "white" ? F.cloth : F.clothGold;
  const trim = F.gold;
  const drop = 0.012 + r * 0.24;
  const val = 0.03 + r * 0.06;
  const teeth = Math.max(12, Math.round((Math.PI * 2 * r) / 0.07));
  const p: RevolvePoint[] = [
    { r: 0.016, y: y + drop + 0.015, f: trim },
    { r: 0.03, y: y + drop, f: trim },
    { r: 0.04, y: y + drop * 0.95, f: cloth },
    { r: r * 0.55, y: y + drop * 0.5, f: cloth },
    { r: r * 0.95, y: y + 0.004, f: trim },
    { r: r + 0.004, y: y - 0.004, f: trim, occ: 0.95 },
    { r: r + 0.004, y: y - 0.004, f: trim, occ: 0.95 },
    { r: r + 0.004, y: y - val * 0.62, f: cloth, occ: 0.88 },
    { r: r + 0.005, y: y - val * 0.7, f: trim, occ: 0.85, hem: 0 },
    { r: r + 0.006, y: y - val, f: trim, occ: 0.8, hem: 1 },
    { r: r - 0.002, y: y - val, f: trim, occ: 0.5, hem: 1 },
    { r: r - 0.002, y: y - 0.01, f: cloth, occ: 0.45 },
    { r: r * 0.55, y: y + drop * 0.42, f: cloth, occ: 0.55 },
    { r: 0.014, y: y + drop, f: trim, occ: 0.6 },
  ];
  return revolve(p, teeth * 2, (hem, a) => {
    const f = ((((a * teeth) / (Math.PI * 2)) % 1) + 1) % 1;
    return -hem * 0.028 * (1 - Math.abs(f - 0.5) * 2) ** 1.5;
  });
}

/**
 * A Khmer ceremonial parasol (chhatr, 2.2 m): 7 (or 5) tiers of white (or
 * gold) cloth, smaller upward, each with a gold-trimmed valance cut in
 * points, on a gilt pole with a lotus-bud finial, in a lotus stand. Stand
 * one on each side of a Buddha.
 */
export function parasol(o: ParasolOptions = {}): OfferingPiece {
  const tiers = o.tiers ?? 7;
  const look = o.look ?? "white";
  const H = 2.2;
  const k = (o.height ?? H) / H;
  return piece("parasol", { ...o, scale: (o.scale ?? 1) * k }, [0.76, H], (d) =>
    statueMesh(
      merged(`parasol:${tiers}:${look}`, d, () => {
        const T = parasolTiers(tiers);
        const parts = T.map((t) => parasolTier(t.y, t.r, look));
        // The gilt pole, and the finial: rings, a lotus bud, a spike.
        parts.push(
          finishGeometry(
            new CylinderGeometry(0.011, 0.013, 2.0, 10, 1).translate(
              0,
              1.14,
              0,
            ),
            F.gold,
          ),
        );
        const top = T[T.length - 1].y + 0.06;
        const fin: [number, number][] = [
          [0, top],
          [0.03, top + 0.01],
          [0.022, top + 0.03],
          [0.028, top + 0.045],
          [0.018, top + 0.065],
          [0.024, top + 0.08],
          [0.012, top + 0.1],
          [0.03, top + 0.14],
          [0.022, top + 0.18],
          [0.006, top + 0.22],
          [0.003, H - 0.02],
          [0, H],
        ];
        parts.push(
          revolve(
            fin.map(([r, y]) => ({ r, y, f: F.gold })),
            16,
          ),
        );
        return [dressed("parasolStand", d, buildParasolStand), ...parts];
      }),
    ),
  );
}

// ── Tools (also for stupa.ts) ─────────────────────────────────────────────

/** 0 below 0, 1 above 1, smooth between. */
export function smooth01(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

/**
 * A plan's measure of how far (x, z) is from the axis: the outline at size
 * r is where it equals r (round, square, the Khmer redented square).
 */
export type Plan = (x: number, z: number) => number;
export const ROUND: Plan = (x, z) => Math.sqrt(x * x + z * z);
export const SQUARE: Plan = (x, z) => Math.max(Math.abs(x), Math.abs(z));

/**
 * The Khmer redented square: a square with each corner stepped in twice,
 * `a` the whole step as a share of the half-width (a cross of two
 * rectangles and a square between).
 */
export function redented(a = 0.14): Plan {
  const k1 = 1 / (1 - a);
  const k2 = 1 / (1 - a / 2);
  return (x, z) => {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    return Math.min(
      Math.max(ax, az * k1),
      Math.max(ax * k1, az),
      Math.max(ax, az) * k2,
    );
  };
}

/** A profile's corners cut `round` m back, twice (a soft, turned edge). */
function roundProfile(
  pts: readonly (readonly [number, number])[],
  round: number,
): [number, number][] {
  let p = pts.map((q) => [q[0], q[1]] as [number, number]);
  for (const cut of [round, round / 2]) {
    if (cut <= 0) break;
    const out: [number, number][] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[i + 1];
      const l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      const c = Math.min(0.25, cut / l);
      if (i > 0) out.push([ax + (bx - ax) * c, ay + (by - ay) * c]);
      if (i < p.length - 2) out.push([bx - (bx - ax) * c, by - (by - ay) * c]);
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/**
 * The outside radius of a lathe profile at height y (m), grown by `out`:
 * the first wall going up from its foot (for a band that hugs a belly).
 */
export function profileRadius(
  profile: readonly (readonly [number, number])[],
  out = 0,
): (y: number) => number {
  const pts = profile.slice(1);
  return (y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ar, ay] = pts[i];
      const [br, by] = pts[i + 1];
      if (by <= ay) break;
      if (y <= by || i === pts.length - 2)
        return (
          ar + (br - ar) * Math.max(0, Math.min(1, (y - ay) / (by - ay))) + out
        );
    }
    return pts[0][0] + out;
  };
}

/**
 * A solid turned round the y axis from a profile of [r, y] points (m),
 * from the axis at its foot round to the axis at its top (the first and
 * last points have r = 0). `plan` gives a square or redented body instead
 * of a round one; `round` softens the profile's corners (m); `at` moves it.
 */
export function lathe(
  profile: readonly (readonly [number, number])[],
  o: { plan?: Plan; round?: number; at?: V3; res?: number } = {},
): Shape {
  const pts = roundProfile(profile, o.round ?? 0);
  const plan = o.plan ?? ROUND;
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const m = pts.length - 1;
  const ax = new Float64Array(m);
  const ay = new Float64Array(m);
  const ex = new Float64Array(m);
  const ey = new Float64Array(m);
  const inv = new Float64Array(m);
  const ylo = new Float64Array(m);
  const yhi = new Float64Array(m);
  const rlo = new Float64Array(m);
  const rhi = new Float64Array(m);
  let R = 0;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < m; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[i + 1];
    ax[i] = px;
    ay[i] = py;
    ex[i] = qx - px;
    ey[i] = qy - py;
    inv[i] = 1 / Math.max(ex[i] * ex[i] + ey[i] * ey[i], 1e-18);
    ylo[i] = Math.min(py, qy);
    yhi[i] = Math.max(py, qy);
    rlo[i] = Math.min(px, qx);
    rhi[i] = Math.max(px, qx);
    R = Math.max(R, px, qx);
    y0 = Math.min(y0, py, qy);
    y1 = Math.max(y1, py, qy);
  }
  // The profile's own 2D distance (r, y): nearest edge, inside by crossings.
  const exact = (r: number, yy: number) => {
    let best = Infinity;
    let inside = false;
    for (let i = 0; i < m; i++) {
      const va = ay[i];
      const vb = va + ey[i];
      if (va > yy !== vb > yy) {
        const xi = ax[i] + ((yy - va) / ey[i]) * ex[i];
        if (r < xi) inside = !inside;
      }
      const dy = yy < ylo[i] ? ylo[i] - yy : yy > yhi[i] ? yy - yhi[i] : 0;
      const dr = r < rlo[i] ? rlo[i] - r : r > rhi[i] ? r - rhi[i] : 0;
      if (dy * dy + dr * dr >= best) continue;
      const wx = r - ax[i];
      const wy = yy - va;
      let t = (wx * ex[i] + wy * ey[i]) * inv[i];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const bx = wx - ex[i] * t;
      const by = wy - ey[i] * t;
      const dd = bx * bx + by * by;
      if (dd < best) best = dd;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  };
  // Looked up in a table of that distance (bilinear): far cheaper than the edges each time.
  const res = o.res ?? Math.max(R, y1 - y0) / 110;
  const pad = 6 * res;
  const ty0 = y0 - pad;
  const nr = Math.ceil((R + pad) / res) + 2;
  const ny = Math.ceil((y1 - y0 + 2 * pad) / res) + 2;
  const tab = new Float32Array(nr * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nr; i++)
      tab[i + nr * j] = exact(i * res, ty0 + j * res);
  const ires = 1 / res;
  return {
    d(x, y, z) {
      const r = plan(x - cx, z - cz);
      const yy = y - cy;
      const fi = r * ires;
      const fj = (yy - ty0) * ires;
      if (fi >= nr - 1 || fj < 0 || fj >= ny - 1) {
        // (outside the table: at least the way to it and its margin)
        const dr = Math.max(0, r - (nr - 1) * res);
        const dy = fj < 0 ? -fj * res : Math.max(0, fj - (ny - 1)) * res;
        return Math.sqrt(dr * dr + dy * dy) + pad;
      }
      const i = fi | 0;
      const j = fj | 0;
      const u = fi - i;
      const v = fj - j;
      const k = i + nr * j;
      const a = tab[k] + (tab[k + 1] - tab[k]) * u;
      const b = tab[k + nr] + (tab[k + nr + 1] - tab[k + nr]) * u;
      return a + (b - a) * v;
    },
    box: [cx - R, cy + y0, cz - R, cx + R, cy + y1, cz + R],
  };
}

/** A ring of pointed leaves or petals (see `crown`). */
export interface CrownOptions {
  /** The band's foot and the points' feet (m). */
  y0: number;
  y1: number;
  /** Its radius at y0 and at y1 (m), straight between (and on up the points). */
  r0: number;
  r1: number;
  /** Or its radius at any height (m): to hug a curved belly (see `profileRadius`). */
  radiusAt?: (y: number) => number;
  /** How many points round. */
  n: number;
  /** How high the points rise above y1 (m); < 0: they hang below y0 instead. */
  tip: number;
  /** Outline of a point: 1 a straight triangle, ~0.6 a lotus petal (round shoulders, a pointed tip). */
  shape?: number;
  /** How far each point's middle stands out (m). */
  bulge?: number;
  /** How much the points lean out (m out per m of point). */
  flare?: number;
  /** Turn of the points (share of one point's width). */
  phase?: number;
  /** Where the axis stands (m). */
  at?: V3;
  /** Plan (default round). */
  plan?: Plan;
}

/**
 * A ring of pointed leaves or petals round the y axis: a band from radius
 * r0 at y0 to r1 at y1 whose edge rises in `n` points (a bay sei's folded
 * leaves, a lotus moulding's petals; hanging down when `tip` < 0).
 */
export function crown(o: CrownOptions): Shape {
  const { y0, y1, r0, r1, n, tip } = o;
  const shape = o.shape ?? 1;
  const bulge = o.bulge ?? 0;
  const flare = o.flare ?? 0;
  const phase = o.phase ?? 0;
  const plan = o.plan ?? ROUND;
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const up = tip >= 0;
  const h = Math.max(y1 - y0, 1e-6);
  const slope = (r1 - r0) / h;
  const radius = o.radiusAt ?? ((y: number) => r0 + slope * (y - y0));
  const lo = up ? y0 : y0 + tip;
  const hi = up ? y1 + tip : y1;
  // The side's slope (for a true distance) and the widest it gets, sampled.
  let steep = Math.abs(slope);
  let widest = 0;
  for (let i = 0; i <= 16; i++) {
    const y = lo + ((hi - lo) * i) / 16;
    widest = Math.max(widest, radius(y));
    steep = Math.max(
      steep,
      Math.abs(radius(y + 1e-4) - radius(y - 1e-4)) / 2e-4,
    );
  }
  const sideNorm = 1 / Math.sqrt(1 + Math.min(steep, 4) ** 2);
  const rMid = radius((y0 + y1) / 2);
  const edgeNorm =
    1 / Math.sqrt(1 + ((2 * Math.abs(tip)) / ((Math.PI * 2 * rMid) / n)) ** 2);
  const R = widest + Math.abs(tip * flare) + bulge + 0.001;
  return {
    d(x, y, z) {
      const px = x - cx;
      const pz = z - cz;
      const yy = y - cy;
      const a = Math.atan2(pz, px);
      let u = (a / (Math.PI * 2)) * n + phase;
      u = u - Math.floor(u) - 0.5;
      const w = 1 - Math.abs(u) * 2;
      // Radius of the band here: its slope, the points leaning out, the middle bulging.
      const over = up ? Math.max(0, yy - y1) : Math.max(0, y0 - yy);
      const rr = radius(yy) + flare * over + bulge * (1 - 4 * u * u);
      const side = (plan(px, pz) - rr) * sideNorm;
      const edge = tip * Math.pow(w, shape);
      const ends = up
        ? Math.max(y0 - yy, (yy - (y1 + edge)) * edgeNorm)
        : Math.max(yy - y1, (y0 + edge - yy) * edgeNorm);
      return Math.max(side, ends);
    },
    box: [cx - R, cy + lo, cz - R, cx + R, cy + hi, cz + R],
  };
}

/** A point of a `revolve` profile: radius and height (m), its finish, occlusion (0 dark ‥ 1 open), hem weight for the edge function. */
export interface RevolvePoint {
  r: number;
  y: number;
  f: Finish;
  occ?: number;
  hem?: number;
}

/**
 * A plain mesh turned round the y axis from a profile (for thin things
 * the sculpt cannot hold: cloth, spikes), ready for `statueMaterial()`.
 * `edge(hem, angle)` moves each point up or down (m) round the turn (a
 * hem cut in points). A point given twice makes a sharp crease.
 */
export function revolve(
  profile: RevolvePoint[],
  segs: number,
  edge?: (hem: number, angle: number) => number,
): BufferGeometry {
  const np = profile.length;
  const pos: number[] = [];
  const col: number[] = [];
  const fin: number[] = [];
  const occ: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const p of profile) {
      const dy = edge && p.hem !== undefined ? edge(p.hem, a) : 0;
      pos.push(ca * p.r, p.y + dy, sa * p.r);
      c.setHex(p.f.color, SRGBColorSpace);
      col.push(c.r, c.g, c.b);
      fin.push(p.f.metal, p.f.rough, p.f.grain ?? 0.3);
      occ.push(p.occ ?? 1);
    }
  }
  // Faces outward whichever way round the profile runs (its signed area, closed along the axis).
  let area = 0;
  for (let i = 0; i < np; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % np];
    area += p.r * q.y - q.r * p.y;
  }
  const cw = area < 0;
  for (let j = 0; j < segs; j++)
    for (let i = 0; i < np - 1; i++) {
      const a = j * np + i;
      const b = a + np;
      if (cw) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("finish", new BufferAttribute(new Float32Array(fin), 3));
  g.setAttribute("occlusion", new BufferAttribute(new Float32Array(occ), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A plain three.js geometry made ready for `statueMaterial()`: one finish
 * all over, `occ` its occlusion (1 open). Its uvs are dropped.
 */
export function finishGeometry(
  g: BufferGeometry,
  f: Finish,
  occ = 1,
): BufferGeometry {
  const n = g.getAttribute("position").count;
  const c = new Color().setHex(f.color, SRGBColorSpace);
  const col = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b], i * 3);
    fin.set([f.metal, f.rough, f.grain ?? 0.3], i * 3);
  }
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setAttribute("finish", new BufferAttribute(fin, 3));
  g.setAttribute(
    "occlusion",
    new BufferAttribute(new Float32Array(n).fill(occ), 1),
  );
  if (g.getAttribute("uv")) g.deleteAttribute("uv");
  return g;
}

/** Only the attributes `statueMaterial()` reads (so plain geometries merge). */
export function plainAttributes(g: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(g.attributes))
    if (!["position", "normal", "color", "finish", "occlusion"].includes(name))
      g.deleteAttribute(name);
  if (!g.getIndex()) {
    const n = g.getAttribute("position").count;
    g.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  return g;
}

/** A thin round rod from a to b (radius r; plain, few faces). */
export function tubeBetween(
  a: Vector3,
  b: Vector3,
  r: number,
  sides = 6,
): BufferGeometry {
  const d = b.clone().sub(a);
  const g = new CylinderGeometry(r, r, d.length(), sides, 1, true);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()),
  );
  g.translate(a.x, a.y, a.z);
  return g;
}

/** How a sheet looks at (u, v): its finish and occlusion (0 dark ‥ 1 open). */
export type SheetLook = (u: number, v: number) => { f: Finish; occ: number };

/**
 * A plain sheet (for thin things: petals, leaves, folded banana leaf),
 * ready for `statueMaterial()`: a grid of `nu` × `nv` cells over u, v in
 * 0‥1 placed by `at`; its front faces du × dv. With `thick` (m) it is a
 * thin solid, both faces and the rim (the back in `backLook`); without,
 * one-sided.
 */
export function sheet(
  nu: number,
  nv: number,
  at: (u: number, v: number) => V3,
  look: SheetLook,
  thick = 0,
  backLook?: SheetLook,
): BufferGeometry {
  const row = nu + 1;
  const n = row * (nv + 1);
  const P = new Float32Array(n * 3);
  const looks: { f: Finish; occ: number }[] = [];
  const backs: { f: Finish; occ: number }[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      P.set(at(u, v), (j * row + i) * 3);
      looks.push(look(u, v));
      if (thick) backs.push((backLook ?? look)(u, v));
    }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * row + i;
      const c = a + row;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  const top = new BufferGeometry();
  top.setAttribute("position", new BufferAttribute(P, 3));
  top.setIndex(idx);
  top.computeVertexNormals();
  if (!thick) return withLooks(top, looks);
  const N = top.getAttribute("normal").array as Float32Array;
  const pos = new Float32Array(n * 6);
  const nor = new Float32Array(n * 6);
  const h = thick / 2;
  for (let k = 0; k < n * 3; k++) {
    pos[k] = P[k] + N[k] * h;
    pos[n * 3 + k] = P[k] - N[k] * h;
    nor[k] = N[k];
    nor[n * 3 + k] = -N[k];
  }
  const all = idx.slice();
  for (let t = 0; t < idx.length; t += 3)
    all.push(idx[t] + n, idx[t + 2] + n, idx[t + 1] + n);
  // The rim, round the edge in turn (anticlockwise seen from the front).
  const loop: number[] = [];
  for (let i = 0; i < nu; i++) loop.push(i);
  for (let j = 0; j < nv; j++) loop.push(j * row + nu);
  for (let i = nu; i > 0; i--) loop.push(nv * row + i);
  for (let j = nv; j > 0; j--) loop.push(j * row);
  for (let e = 0; e < loop.length; e++) {
    const p = loop[e];
    const q = loop[(e + 1) % loop.length];
    all.push(p, q + n, q, p, p + n, q + n);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setIndex(all);
  return withLooks(g, [...looks, ...backs]);
}

/** Colour, finish and occlusion attributes from a look per vertex. */
function withLooks(
  g: BufferGeometry,
  looks: { f: Finish; occ: number }[],
): BufferGeometry {
  const n = looks.length;
  const col = new Float32Array(n * 3);
  const fin = new Float32Array(n * 3);
  const occ = new Float32Array(n);
  const c = new Color();
  looks.forEach((l, i) => {
    c.setHex(l.f.color, SRGBColorSpace);
    col.set([c.r, c.g, c.b], i * 3);
    fin.set([l.f.metal, l.f.rough, l.f.grain ?? 0.3], i * 3);
    occ[i] = l.occ;
  });
  g.setAttribute("color", new BufferAttribute(col, 3));
  g.setAttribute("finish", new BufferAttribute(fin, 3));
  g.setAttribute("occlusion", new BufferAttribute(occ, 1));
  return g;
}

/**
 * A string of `n` beads (jasmine buds) round the y axis at height y:
 * ring radius R, bead radius r (plain, ready for `statueMaterial()`),
 * darker on the side facing the axis.
 */
export function beadRing(
  R: number,
  y: number,
  r: number,
  n: number,
  f: Finish,
): BufferGeometry {
  const segs = n * 2;
  const sides = 4;
  return sheet(
    segs,
    sides,
    (u, v) => {
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const t =
        r * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos((a * n) / 2)), 0.7));
      const rr = R + Math.cos(b) * t;
      return [Math.cos(a) * rr, y + Math.sin(b) * t, Math.sin(a) * rr];
    },
    (_u, v) => ({ f, occ: 0.65 + 0.35 * Math.cos(v * Math.PI * 2) }),
  );
}

/** Smooth value noise in −1‥1 (deterministic; a quicker `noise3`). */
export function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let u = x - xi;
  let v = y - yi;
  let w = z - zi;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  w = w * w * (3 - 2 * w);
  const a = hn(xi, yi, zi);
  const b = hn(xi + 1, yi, zi);
  const c = hn(xi, yi + 1, zi);
  const d = hn(xi + 1, yi + 1, zi);
  const e = hn(xi, yi, zi + 1);
  const f = hn(xi + 1, yi, zi + 1);
  const g = hn(xi, yi + 1, zi + 1);
  const h = hn(xi + 1, yi + 1, zi + 1);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  const ef = e + (f - e) * u;
  const gh = g + (h - g) * u;
  const lo = ab + (cd - ab) * v;
  const hi = ef + (gh - ef) * v;
  return lo + (hi - lo) * w;
}

function hn(i: number, j: number, k: number): number {
  let n =
    (Math.imul(i, 374761393) +
      Math.imul(j, 668265263) +
      Math.imul(k, 2147483647)) |
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) & 0xffff) / 32767.5 - 1;
}
