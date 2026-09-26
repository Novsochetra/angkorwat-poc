import {
  Group,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  type Object3D,
} from "three";
import { SACRED_LAMPS } from "./finish";
import {
  candleLamp,
  OFFERING_KINDS,
  offering,
  offeringStats,
  type OfferingKind,
  type OfferingPiece,
} from "./offerings";
import type { Piece, PieceMaker } from "./pieces";
import { buddhaStatue } from "./buddha";
import { stupa, stupaNiche, stupaStats, type StupaLook } from "./stupa";

/**
 * Offerings and stupas for the preview (sacred.html):
 *
 * - `offering-<kind>` (candle, incense, lotusVase, baySei, fruitPlate,
 *   marigold, parasol, alms), `offering-<kind>-far` (the far mesh);
 *   `offering-candle-white`, `offering-parasol-gold`, `offering-parasol-5`,
 *   `offering-baySei-3|7`.
 * - `offerings-all`: a row of them all but the parasol;
 *   `offerings-altar`: an altar table dressed with them, two parasols.
 * - `stupa-white`, `stupa-gold`, `stupa-stone` (4 m), `stupa-niche`
 *   (2.4 m, white), `stupa-niche-gold`, `stupa-niche-stone`; add `-far`
 *   for the far mesh (`stupa-white-far`…); `stupa-niche-buddha`: a small
 *   Buddha seated in the niche (where `stupaNiche` says).
 */

const tris = (o: Object3D, far = false): number => {
  let t = 0;
  o.traverse((m) => {
    const g = (m as Mesh).geometry;
    if (!g || !(m as Mesh).isMesh) return;
    // (only one level of each LOD)
    let p = m.parent;
    while (p && !(p as { isLOD?: boolean }).isLOD) p = p.parent;
    if (p) {
      const levels = (p as unknown as { levels: { object: Object3D }[] })
        .levels;
      const want = levels[far ? 1 : 0].object;
      let q: Object3D | null = m;
      while (q && q.parent !== p) q = q.parent;
      if (q !== want) return;
    }
    const n = g.getIndex()
      ? g.getIndex()!.count / 3
      : g.getAttribute("position").count / 3;
    t += n * ((m as { count?: number }).count ?? 1);
  });
  return Math.round(t);
};

/** Show only the far level of each LOD (to look at it up close). */
function onlyFar(o: Object3D): void {
  o.traverse((m) => {
    const lod = m as unknown as {
      isLOD?: boolean;
      levels: { distance: number }[];
    };
    if (lod.isLOD)
      for (const l of lod.levels) l.distance = l === lod.levels[1] ? 0 : 1e9;
  });
}

const stats = (): string =>
  offeringStats()
    .map((s) => `${s.key} ${s.triangles}▲ ${s.ms.toFixed(0)}ms`)
    .join(", ");

const show = (p: OfferingPiece, far = false): Piece => {
  if (far) onlyFar(p.object);
  return {
    object: p.object,
    size: p.size,
    note: `${tris(p.object, far)} triangles · ${stats()}`,
  };
};

export const PIECES: Record<string, PieceMaker> = {};
for (const kind of OFFERING_KINDS) {
  PIECES[`offering-${kind}`] = () => show(offering(kind));
  PIECES[`offering-${kind}-far`] = () => show(offering(kind), true);
}
PIECES["offering-candle-white"] = () =>
  show(offering("candle", { wax: "white" }));
PIECES["offering-parasol-gold"] = () =>
  show(offering("parasol", { look: "gold" }));
PIECES["offering-parasol-5"] = () => show(offering("parasol", { tiers: 5 }));
PIECES["offering-baySei-3"] = () => show(offering("baySei", { tiers: 3 }));
PIECES["offering-baySei-7"] = () => show(offering("baySei", { tiers: 7 }));

/** A row of offerings, spaced by their widths. */
function row(kinds: OfferingKind[]): Piece {
  const g = new Group();
  let x = 0;
  let h = 0;
  let t = 0;
  const items = kinds.map((k) =>
    offering(
      k,
      k === "marigold"
        ? { from: [-0.2, 0.32, 0], to: [0.2, 0.32, 0], sag: 0.14 }
        : {},
    ),
  );
  const width = items.reduce((a, p) => a + p.size[0] + 0.08, -0.08);
  for (const p of items) {
    p.object.position.x = x - width / 2 + p.size[0] / 2;
    x += p.size[0] + 0.08;
    h = Math.max(h, p.size[1]);
    t += tris(p.object);
    g.add(p.object);
  }
  return {
    object: g,
    size: [width * 0.75, h],
    note: `${t} triangles · ${stats()}`,
  };
}

PIECES["offerings-all"] = () =>
  row([
    "candle",
    "incense",
    "lotusVase",
    "baySei",
    "fruitPlate",
    "marigold",
    "alms",
  ]);

PIECES["offerings-altar"] = () => {
  const g = new Group();
  // A red lacquered altar table (a stand-in for the real one).
  const top = 0.75;
  const table = new Mesh(
    new BoxGeometry(1.6, top, 0.6),
    new MeshStandardMaterial({ color: 0x6e1c16, roughness: 0.45 }),
  );
  table.position.y = top / 2;
  g.add(table);
  const put = (p: OfferingPiece, x: number, z: number, y = top) => {
    p.object.position.set(x, y, z);
    g.add(p.object);
    // Each candle flame lights the pieces round it (the preview does not move the altar).
    p.object.updateWorldMatrix(true, false);
    for (const f of p.flames)
      SACRED_LAMPS.push(candleLamp(p.object.localToWorld(f.clone())));
  };
  put(offering("baySei"), -0.58, -0.12);
  put(offering("baySei"), 0.58, -0.12);
  put(offering("lotusVase"), -0.32, -0.12);
  put(offering("lotusVase"), 0.32, -0.12);
  put(offering("incense"), 0, 0.1);
  put(offering("candle"), -0.14, 0.14);
  put(offering("candle"), 0.14, 0.14);
  put(offering("fruitPlate"), -0.38, 0.14);
  put(offering("alms"), 0.4, 0.13);
  put(
    offering("marigold", {
      from: [-0.78, 0.72, 0.305],
      to: [0.78, 0.72, 0.305],
      sag: 0.16,
    }),
    0,
    0,
    0,
  );
  put(offering("parasol"), -1.05, -0.1, 0);
  put(offering("parasol"), 1.05, -0.1, 0);
  return { object: g, size: [2.2, 2.2], note: `${stats()}` };
};

const stupaPiece = (
  look: StupaLook,
  height: number,
  niche: boolean,
  far = false,
): Piece => {
  const object = stupa({ height, look, niche });
  if (far) onlyFar(object);
  const st = stupaStats()
    .map((s) => `${s.key} ${s.triangles}▲ ${s.ms.toFixed(0)}ms`)
    .join(", ");
  return {
    object,
    size: [height * 0.5, height],
    note: `${tris(object, far)} triangles · ${st}`,
  };
};
for (const look of ["white", "gold", "stone"] as const) {
  PIECES[`stupa-${look}`] = () => stupaPiece(look, 4, false);
  PIECES[`stupa-${look}-far`] = () => stupaPiece(look, 4, false, true);
  PIECES[`stupa-niche${look === "white" ? "" : "-" + look}`] = () =>
    stupaPiece(look, 2.4, true);
}

PIECES["stupa-niche-buddha"] = () => {
  const g = new Group();
  const height = 2.4;
  g.add(stupa({ height, look: "white", niche: true }));
  const n = stupaNiche({ height, look: "white" });
  const b = buddhaStatue({
    kind: "meditate",
    look: "gilt",
    height: n.height * 0.7,
    farOnly: true,
    hide: 1e9,
    sync: true,
  });
  b.position.copy(n.at);
  g.add(b);
  return {
    object: g,
    size: [height * 0.5, height],
    note: `niche ${n.width.toFixed(2)} × ${n.height.toFixed(2)} × ${n.depth.toFixed(2)} m at ${n.at.toArray().map((v) => v.toFixed(2))}`,
  };
};
