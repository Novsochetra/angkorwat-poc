import { BufferGeometry, Group, LOD, Mesh, Object3D, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  dress,
  PALETTES,
  statueMaterial,
  type Finish,
  type Palette,
} from "./finish";
import {
  crown,
  lathe,
  plainAttributes,
  redented,
  revolve,
  smooth01,
  SQUARE,
  vnoise,
  type Plan,
} from "./offerings";
import { meshSculpt, Sculpt, type SculptMesh } from "./sculpt";
import { roundBox, rot, union, type Shape } from "./sdf";

/**
 * Khmer stupas (chedei), sculpted smooth like the Buddhas (sculpt.ts): a
 * square stepped base with its mouldings and redented corners, a band of
 * lotus petals, a bell-shaped body with redented corners, a small square
 * harmika, a spire of stacked rings tapering to a lotus bud and a gold
 * tip. Whitewashed with gold for the pagoda (`white`), gilded (`gold`),
 * or weathered sandstone on laterite with moss and rain stains for the
 * jungle (`stone`). With `niche`, a pointed niche opens in the front of
 * the base for a small Buddha (`stupaNiche` says where it stands).
 *
 *   const s = stupa({ height: 4, look: 'white' });   // on y = 0, front +z
 *
 * Its shape is sculpted once per kind at a 4 m reference and shared.
 */

export type StupaLook = "white" | "gold" | "stone";

export interface StupaOptions {
  /** Height from the foot to the tip (m). */
  height: number;
  look: StupaLook;
  /** A niche in the front of the base (for a small Buddha). */
  niche?: boolean;
  /** Up to this distance (m) the near mesh shows, the far one beyond (default 12 × height). */
  near?: number;
  /** Hidden past this distance (m; default 120 × height). */
  hide?: number;
}

/**
 * Where a stupa's niche is, in the stupa's space (m): its floor's middle,
 * and its opening. A seated Buddha about 0.7 × `height` tall fits.
 */
export interface StupaNiche {
  /** The middle of the niche's floor (a Buddha's foot goes here, facing +z). */
  at: Vector3;
  /** The opening's width and height to the arch's point, and the niche's depth (m). */
  width: number;
  height: number;
  depth: number;
}

// ── Measures (the 4 m reference) ──────────────────────────────────────────

/** Height of the base's upper dado: taller with a niche in it. */
const dado = (niche: boolean) => (niche ? 0.9 : 0.42);
/** How much everything above the base rises for a niche. */
const lift = (niche: boolean) => dado(niche) - 0.42;
/** The reference's full height (to the tip; the stone one ends at its bud). */
const top = (niche: boolean, look: StupaLook) =>
  (look === "stone" ? 3.6 : 4.0) + lift(niche);

const NICHE = {
  floor: 0.7,
  halfWidth: 0.25,
  spring: 1.2,
  point: 1.44,
  depth: 0.36,
  face: 0.6,
};

/** Where the niche is for a stupa of these options (see `StupaNiche`). */
export function stupaNiche(
  o: Pick<StupaOptions, "height" | "look">,
): StupaNiche {
  const k = o.height / top(true, o.look);
  return {
    at: new Vector3(0, NICHE.floor * k, (NICHE.face - NICHE.depth / 2) * k),
    width: NICHE.halfWidth * 2 * k,
    height: (NICHE.point - NICHE.floor) * k,
    depth: NICHE.depth * k,
  };
}

// ── The sculpt ────────────────────────────────────────────────────────────

/** A profile of [r, y] points moved up by `dy`. */
const up = (p: [number, number][], dy: number): [number, number][] =>
  p.map(([r, y]) => [r, y + dy]);

function buildStupa(niche: boolean, stone: boolean): Sculpt {
  const s = new Sculpt();
  const dh = dado(niche);
  const L = lift(niche);
  const base: Plan = redented(0.14);
  // (the stone's wear is pressed into its mesh after: see `weather`)

  // The plinth (laterite under the stone one) and the base's mouldings, redented.
  s.add(
    lathe(
      [
        [0, 0],
        [0.85, 0],
        [0.85, 0.09],
        [0.81, 0.09],
        [0.81, 0.13],
        [0.775, 0.155],
        [0.797, 0.19],
        [0.765, 0.225],
        [0.73, 0.245],
        [0.72, 0.42],
        [0.75, 0.44],
        [0.78, 0.475],
        [0.78, 0.5],
        [0.7, 0.52],
        [0.68, 0.55],
        [0.645, 0.57],
        [0.667, 0.605],
        [0.62, 0.64],
        [0.6, 0.66],
        [0.6, 0.66 + dh],
        [0.635, 0.69 + dh],
        [0.655, 0.725 + dh],
        [0.56, 0.75 + dh],
        [0.53, 0.78 + dh],
        [0.5, 0.8 + dh],
        [0, 0.8 + dh],
      ],
      { plan: base, round: 0.016, res: 0.009 },
    ),
    "wall",
  );
  // A band of lotus petals, the bell on it.
  s.add(
    crown({
      y0: 1.19 + L,
      y1: 1.25 + L,
      r0: 0.5,
      r1: 0.49,
      n: 16,
      tip: 0.11,
      shape: 0.6,
      bulge: 0.014,
      flare: 0.22,
    }),
    "petal",
    0.008,
  );
  const B = 1.28 + L;
  s.add(
    lathe(
      [
        [0, B - 0.05],
        [0.43, B - 0.05],
        [0.465, B + 0.03],
        [0.505, B + 0.12],
        [0.525, B + 0.22],
        [0.51, B + 0.4],
        [0.455, B + 0.6],
        [0.37, B + 0.76],
        [0.28, B + 0.87],
        [0.235, B + 0.92],
        [0, B + 0.93],
      ],
      { round: 0.02, res: 0.009 },
    ),
    "body",
    0.02,
  );
  // A moulded ring round the bell's shoulder.
  s.add(
    lathe(
      up(
        [
          [0, 0.19],
          [0.525, 0.19],
          [0.54, 0.215],
          [0.525, 0.24],
          [0, 0.24],
        ],
        B,
      ),
      { round: 0.008, res: 0.006 },
    ),
    "body",
    0.01,
  );
  // The harmika: a small square box with a cornice.
  s.add(
    lathe(
      up(
        [
          [0, 2.19],
          [0.25, 2.19],
          [0.25, 2.25],
          [0.225, 2.275],
          [0.21, 2.36],
          [0.262, 2.39],
          [0.262, 2.445],
          [0.17, 2.47],
          [0, 2.47],
        ],
        L,
      ),
      { plan: SQUARE, round: 0.01, res: 0.005 },
    ),
    "harmika",
    0.01,
  );
  // The spire: ten rings, smaller upward, then the lotus bud.
  const spire: [number, number][] = [[0, 2.455]];
  for (let k = 0; k < 10; k++) {
    const y = 2.46 + k * 0.08;
    const R = 0.19 - k * 0.012;
    spire.push(
      [R - 0.026, y],
      [R, y + 0.028],
      [R, y + 0.048],
      [R - 0.026, y + 0.08],
    );
  }
  spire.push(
    [0.06, 3.265],
    [0.085, 3.33],
    [0.082, 3.41],
    [0.052, 3.49],
    [0.018, 3.56],
    [0, 3.6],
  );
  s.add(lathe(up(spire, L), { round: 0.007, res: 0.005 }), "ring", 0.008);
  s.add(
    crown({
      y0: 3.26 + L,
      y1: 3.3 + L,
      r0: 0.07,
      r1: 0.085,
      n: 8,
      tip: 0.065,
      shape: 0.6,
      bulge: 0.007,
      flare: 0.25,
    }),
    "bud",
    0.006,
  );
  s.fine([-0.3, 2.2 + L, -0.3, 0.3, 3.62 + L, 0.3]);
  // The plinth and the bud, by height.
  s.paint(roundBox([0, 0.045, 0], [1, 0.055, 1]), "plinth");
  s.paint(roundBox([0, 3.44 + L, 0], [0.2, 0.17, 0.2]), "bud");

  // Gold (or darker) bands on the base's cornices and the bell's shoulder.
  const slab = (y0: number, y1: number, r: number): Shape =>
    roundBox([0, (y0 + y1) / 2, 0], [r, (y1 - y0) / 2, r]);
  s.paint(
    union([
      slab(0.47, 0.51, 1),
      slab(0.69 + dh, 0.735 + dh, 1),
      slab(B + 0.19, B + 0.245, 0.7),
    ]),
    "band",
  );

  if (niche) {
    // A raised frame with a pointed top, the niche cut through it.
    const { floor, halfWidth: w, spring, point, depth, face } = NICHE;
    const diamond = (grow: number, z: number, d: number) => {
      const h = w + grow;
      return roundBox(
        [0, spring, z],
        [h * Math.SQRT1_2, h * Math.SQRT1_2, d],
        0.01,
        rot(0, 0, Math.PI / 4),
      );
    };
    const frameH = (spring - floor) / 2 + 0.03;
    s.add(
      union([
        roundBox(
          [0, floor + frameH - 0.05, face],
          [w + 0.07, frameH, 0.04],
          0.015,
        ),
        diamond(0.07, face, 0.04),
      ]),
      "nicheFrame",
      0.01,
    );
    const opening = union([
      roundBox(
        [0, (floor + spring) / 2, face],
        [w, (spring - floor) / 2, depth],
        0.02,
      ),
      diamond(0, face, depth),
    ]);
    s.carve(opening, 0.015);
    s.paint(
      roundBox(
        [0, (floor + point) / 2, face - depth / 2 - 0.02],
        [w - 0.012, (point - floor) / 2, depth / 2],
        0,
      ),
      "niche",
    );
  }

  // Weather: moss on what faces up and low down, rain streaks down the faces, pale lichen; grime at the foot of the white ones.
  const bounds = s.bounds();
  const slope = (x: number, y: number, z: number) => {
    const e = 0.03;
    const gx = s.distance(x + e, y, z) - s.distance(x - e, y, z);
    const gy = s.distance(x, y + e, z) - s.distance(x, y - e, z);
    const gz = s.distance(x, y, z + e) - s.distance(x, y, z - e);
    return gy / (Math.sqrt(gx * gx + gy * gy + gz * gz) || 1);
  };
  const where = (f: (x: number, y: number, z: number) => number): Shape => ({
    d: (x, y, z) => -f(x, y, z),
    box: bounds,
  });
  if (stone) {
    s.paint(
      where(
        (x, y, z) =>
          0.7 * vnoise(x * 1.7, y * 5, z * 1.7) +
          0.5 * vnoise(x * 9, y * 9, z * 9) -
          0.45,
      ),
      "lichen",
    );
    s.paint(
      where(
        (x, y, z) =>
          vnoise(x * 12, y * 0.9, z * 12) * 0.9 +
          0.35 * vnoise(x * 3, y * 3, z * 3) -
          0.62,
      ),
      "stain",
    );
    s.paint(
      where((x, y, z) => {
        const n =
          0.6 * vnoise(x * 2.3 + 5, y * 2.3, z * 2.3) +
          0.4 * vnoise(x * 8, y * 8, z * 8);
        const rest = (1 - smooth01(y / 1.2)) * 0.5 + n * 0.9 - 1.12;
        // (the slope only when it could decide)
        return rest + 0.9 <= 0
          ? rest
          : rest + 0.9 * smooth01((slope(x, y, z) - 0.35) / 0.4);
      }),
      "moss",
    );
  } else {
    s.paint(
      where((x, y, z) => {
        const n =
          vnoise(x * 10, y * 0.7, z * 10) * 0.8 +
          0.3 * vnoise(x * 2, y * 2, z * 2) -
          0.55;
        return n <= 0 ? n : n - smooth01((slope(x, y, z) - 0.2) / 0.3);
      }),
      "streak",
    );
    s.paint(
      where(
        (x, y, z) =>
          0.4 * vnoise(x * 4, y * 4, z * 4) +
          0.2 * vnoise(x * 13, y * 13, z * 13) +
          (1 - smooth01(y / 0.35)) * 0.8 -
          0.72,
      ),
      "grime",
    );
  }
  return s;
}

// ── Looks ─────────────────────────────────────────────────────────────────

const WHITE: Finish = { color: 0xf5f2ea, metal: 0, rough: 0.88, grain: 0.5 };
const GOLD = PALETTES.gilt.skin;
const SANDSTONE: Finish = { color: 0x9f9584, metal: 0, rough: 0.95, grain: 1 };

/** Region → finish for each look. */
export const STUPA_PALETTES: Record<StupaLook, Palette> = {
  white: {
    "*": WHITE,
    plinth: { color: 0xd9d2c2, metal: 0, rough: 0.92, grain: 0.7 },
    wall: WHITE,
    body: WHITE,
    harmika: WHITE,
    band: GOLD,
    petal: GOLD,
    ring: GOLD,
    bud: GOLD,
    tip: GOLD,
    nicheFrame: GOLD,
    niche: { color: 0x7a1f1a, metal: 0.05, rough: 0.5, grain: 0.3 },
    streak: { color: 0xdedacd, metal: 0, rough: 0.92, grain: 0.7 },
    grime: { color: 0xcdc6b4, metal: 0, rough: 0.95, grain: 0.9 },
  },
  gold: {
    "*": GOLD,
    plinth: { color: 0xe8e2d4, metal: 0, rough: 0.9, grain: 0.6 },
    wall: PALETTES.gilt.robe,
    body: GOLD,
    harmika: PALETTES.gilt.robe,
    band: PALETTES.gilt.hem,
    petal: PALETTES.gilt.hem,
    ring: GOLD,
    bud: PALETTES.gilt.flame,
    tip: PALETTES.gilt.flame,
    nicheFrame: PALETTES.gilt.hem,
    niche: { color: 0x7a1f1a, metal: 0.05, rough: 0.5, grain: 0.3 },
    streak: { color: 0xb88a3a, metal: 0.8, rough: 0.45, grain: 0.5 },
    grime: { color: 0xcfc6b2, metal: 0, rough: 0.95, grain: 0.9 },
  },
  stone: {
    "*": SANDSTONE,
    plinth: { color: 0x8a5a40, metal: 0, rough: 0.97, grain: 1 },
    wall: SANDSTONE,
    body: { color: 0x9b917f, metal: 0, rough: 0.95, grain: 1 },
    harmika: SANDSTONE,
    band: { color: 0x978d7c, metal: 0, rough: 0.95, grain: 1 },
    petal: { color: 0x998e7b, metal: 0, rough: 0.95, grain: 1 },
    ring: { color: 0x958b7a, metal: 0, rough: 0.95, grain: 1 },
    bud: { color: 0x958b7a, metal: 0, rough: 0.95, grain: 1 },
    nicheFrame: { color: 0x978d7c, metal: 0, rough: 0.95, grain: 1 },
    niche: { color: 0x6a6356, metal: 0, rough: 0.97, grain: 1 },
    moss: { color: 0x5c6636, metal: 0, rough: 0.97, grain: 1 },
    stain: { color: 0x6f685c, metal: 0, rough: 0.97, grain: 1 },
    lichen: { color: 0xb9b6a4, metal: 0, rough: 0.97, grain: 1 },
  },
};

// ── Made once, shared ─────────────────────────────────────────────────────

type Detail = "near" | "far";
/** Grid cells (m, reference size) by detail; the niche stupa is a small one (~2.4 m), so its reference is meshed a little coarser. */
const CELL = { near: { cell: 0.042, fineCell: 0.025 }, far: { cell: 0.095 } };
const NICHE_CELL = {
  near: { cell: 0.048, fineCell: 0.028 },
  far: { cell: 0.11 },
};

const sculpts = new Map<string, Sculpt>();
const meshes = new Map<string, SculptMesh>();
const geometries = new Map<string, BufferGeometry>();

function stupaMesh(niche: boolean, stone: boolean, detail: Detail): SculptMesh {
  const key = `${niche ? "niche" : "plain"}/${stone ? "stone" : "stucco"}`;
  const k = `${key}/${detail}`;
  let m = meshes.get(k);
  if (!m) {
    let s = sculpts.get(key);
    if (!s) sculpts.set(key, (s = buildStupa(niche, stone)));
    m = meshSculpt(s, (niche ? NICHE_CELL : CELL)[detail]);
    if (stone) weather(m.geometry, 0.016, 4.2);
    meshes.set(k, m);
    if (meshes.has(`${key}/near`) && meshes.has(`${key}/far`))
      sculpts.delete(key);
    console.info(
      `[sacred] stupa ${k}: ${(m.geometry.getIndex()!.count / 3) | 0} triangles in ${m.ms.toFixed(0)} ms`,
    );
  }
  return m;
}

/**
 * Wears a stone mesh (m): each vertex pushed in or out along its normal
 * by a smooth noise `amp` m deep, `freq` bumps a metre, its normal tipped
 * to match: pitted faces, softened edges. (Far cheaper than wearing the
 * sculpt's shapes.)
 */
function weather(g: BufferGeometry, amp: number, freq: number): void {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const e = 0.35 / freq;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = vnoise(x * freq, y * freq, z * freq);
    const gx = (vnoise((x + e) * freq, y * freq, z * freq) - f) / e;
    const gy = (vnoise(x * freq, (y + e) * freq, z * freq) - f) / e;
    const gz = (vnoise(x * freq, y * freq, (z + e) * freq) - f) / e;
    const nx = n.getX(i);
    const ny = n.getY(i);
    const nz = n.getZ(i);
    const d = gx * nx + gy * ny + gz * nz;
    // (the slope along the surface tips the normal)
    const tx = nx - amp * (gx - d * nx);
    const ty = ny - amp * (gy - d * ny);
    const tz = nz - amp * (gz - d * nz);
    const l = Math.hypot(tx, ty, tz) || 1;
    p.setXYZ(i, x + nx * amp * f, y + ny * amp * f, z + nz * amp * f);
    n.setXYZ(i, tx / l, ty / l, tz / l);
  }
  p.needsUpdate = true;
  n.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

/** The gold tip over the bud (plain: it is slim), reference size. */
function tipGeometry(niche: boolean, look: StupaLook): BufferGeometry {
  const L = lift(niche);
  const f = STUPA_PALETTES[look].tip ?? GOLD;
  const p: [number, number][] = [
    [0, 4.0],
    [0.004, 3.95],
    [0.008, 3.86],
    [0.02, 3.835],
    [0.024, 3.815],
    [0.02, 3.795],
    [0.009, 3.78],
    [0.012, 3.7],
    [0.018, 3.63],
    [0.026, 3.6],
    [0, 3.585],
  ];
  return revolve(
    p.map(([r, y]) => ({ r, y: y + L, f })),
    14,
  );
}

function stupaGeometry(
  niche: boolean,
  look: StupaLook,
  detail: Detail,
): BufferGeometry {
  const k = `${niche}/${look}/${detail}`;
  let g = geometries.get(k);
  if (!g) {
    const body = dress(
      stupaMesh(niche, look === "stone", detail),
      STUPA_PALETTES[look],
    );
    g =
      look === "stone"
        ? body
        : mergeGeometries([
            plainAttributes(body.clone()),
            tipGeometry(niche, look),
          ]);
    geometries.set(k, g);
  }
  return g;
}

/** Sculpt stats for checks: each stupa mesh so far, its triangles and time (ms). */
export function stupaStats(): { key: string; triangles: number; ms: number }[] {
  return [...meshes].map(([key, m]) => ({
    key,
    triangles: (m.geometry.getIndex()!.count / 3) | 0,
    ms: m.ms,
  }));
}

/**
 * A Khmer stupa (see the file's note): an Object3D on y = 0, front +z,
 * `height` m to its tip; with `niche`, `object.userData.niche` is its
 * `StupaNiche`.
 */
export function stupa(o: StupaOptions): Object3D {
  const niche = !!o.niche;
  const k = o.height / top(niche, o.look);
  const lod = new LOD();
  lod.name = "stupa";
  for (const [detail, at] of [
    ["near", 0],
    ["far", o.near ?? 12 * o.height],
  ] as [Detail, number][]) {
    const m = new Mesh(stupaGeometry(niche, o.look, detail), statueMaterial());
    m.castShadow = true;
    m.receiveShadow = true;
    lod.addLevel(m, at);
  }
  lod.addLevel(new Object3D(), o.hide ?? 120 * o.height);
  lod.scale.setScalar(k);
  const object = new Group();
  object.name = `stupa:${o.look}`;
  object.add(lod);
  if (niche) object.userData.niche = stupaNiche(o);
  return object;
}
