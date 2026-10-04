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
import { forceDetail, SacredLod } from "./_detail";
import { stupa, stupaNiche, stupaStats, type StupaForm, type StupaLook } from "./stupa";

/**
 * Offerings and stupas for the preview (sacred.html):
 *
 * - `offering-<kind>` (candle, incense, lotusVase, baySei, fruitPlate,
 *   marigold, parasol, alms), `offering-<kind>-far` (the far mesh),
 *   `offering-parasol-coarse` (its coarse one, _detail.ts);
 *   `offering-candle-white`, `offering-parasol-white` (the parasol is white
 *   by default), `offering-parasol-gold`, `offering-parasol-5`,
 *   `offering-baySei-3|7`.
 * - `offerings-all`: a row of them all but the parasol;
 *   `offerings-altar`: an altar table dressed with them, two parasols.
 * - Stupas (stupa.ts): `stupa-white`, `stupa-gold`, `stupa-stone` (the
 *   Angkor Wat tower form, 4 m), `stupa-white-faces`, `stupa-gold-faces`,
 *   `stupa-stone-faces` (four Bayon faces); `stupa-niche` (4.5 m, white),
 *   `stupa-niche-gold`, `stupa-niche-stone`, `stupa-niche-faces` (5.2 m,
 *   white, the village pagoda's); add `-far` for the far mesh
 *   (`stupa-white-far`, `stupa-niche-faces-far`…), `-coarse` for the
 *   coarse one (_detail.ts); `stupa-niche-buddha`,
 *   `stupa-niche-faces-buddha`: a small Buddha seated in the niche (where
 *   `stupaNiche` says); `stupas-all`: the three looks in both forms.
 */

/** Triangles drawn: of each piece's levels only `level` (0 near, 1 far, 2 coarse; its coarsest if it has fewer). */
const tris = (o: Object3D, level = 0): number => {
  let t = 0;
  const visit = (m: Object3D): void => {
    if (m instanceof SacredLod) {
      const shown = m.levelObject(Math.min(level, m.levelCount - 1));
      if (shown) visit(shown);
      return;
    }
    const g = (m as Mesh).geometry;
    if (g && (m as Mesh).isMesh) {
      const n = g.getIndex()
        ? g.getIndex()!.count / 3
        : g.getAttribute("position").count / 3;
      t += n * ((m as { count?: number }).count ?? 1);
    }
    for (const c of m.children) visit(c);
  };
  visit(o);
  return Math.round(t);
};

const stats = (): string =>
  offeringStats()
    .map((s) => `${s.key} ${s.triangles}▲ ${s.ms.toFixed(0)}ms`)
    .join(", ");

/** A piece shown at a level (0 near, 1 far, 2 coarse: the levels' look up close). */
const show = (p: OfferingPiece, level = 0): Piece => {
  if (level) forceDetail(p.object, level);
  return {
    object: p.object,
    size: p.size,
    note: `${tris(p.object, level)} triangles · ${stats()}`,
  };
};

export const PIECES: Record<string, PieceMaker> = {};
for (const kind of OFFERING_KINDS) {
  PIECES[`offering-${kind}`] = () => show(offering(kind));
  PIECES[`offering-${kind}-far`] = () => show(offering(kind), 1);
}
PIECES["offering-parasol-coarse"] = () => show(offering("parasol"), 2);
PIECES["offering-candle-white"] = () =>
  show(offering("candle", { wax: "white" }));
PIECES["offering-parasol-white"] = () =>
  show(offering("parasol", { look: "white" }));
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

const stupaStatsNote = (): string =>
  stupaStats()
    .map((s) => `${s.key} ${s.triangles}▲ ${s.ms.toFixed(0)}ms`)
    .join(", ");

const stupaPiece = (
  look: StupaLook,
  height: number,
  niche: boolean,
  form: StupaForm = "tower",
  level = 0,
): Piece => {
  const object = stupa({ height, look, niche, form, sync: true });
  if (level) forceDetail(object, level);
  return {
    object,
    size: [height * 0.5, height],
    note: `${tris(object, level)} triangles · ${stupaStatsNote()}`,
  };
};
for (const look of ["white", "gold", "stone"] as const) {
  for (const form of ["tower", "faces"] as const) {
    const name = `stupa-${look}${form === "faces" ? "-faces" : ""}`;
    PIECES[name] = () => stupaPiece(look, 4, false, form);
    PIECES[`${name}-far`] = () => stupaPiece(look, 4, false, form, 1);
    PIECES[`${name}-coarse`] = () => stupaPiece(look, 4, false, form, 2);
  }
  const niche = `stupa-niche${look === "white" ? "" : "-" + look}`;
  PIECES[niche] = () => stupaPiece(look, 4.5, true);
  PIECES[`${niche}-far`] = () => stupaPiece(look, 4.5, true, "tower", 1);
  PIECES[`${niche}-coarse`] = () => stupaPiece(look, 4.5, true, "tower", 2);
}
PIECES["stupa-niche-faces"] = () => stupaPiece("white", 5.2, true, "faces");
PIECES["stupa-niche-faces-far"] = () =>
  stupaPiece("white", 5.2, true, "faces", 1);
PIECES["stupa-niche-faces-coarse"] = () =>
  stupaPiece("white", 5.2, true, "faces", 2);

/** A stupa with a small gilt Buddha seated in its niche. */
const withBuddha = (height: number, form: StupaForm): Piece => {
  const g = new Group();
  g.add(stupa({ height, look: "white", niche: true, form, sync: true }));
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
    note: `niche ${n.width.toFixed(2)} × ${n.height.toFixed(2)} × ${n.depth.toFixed(2)} m at ${n.at.toArray().map((v) => v.toFixed(2))} · ${stupaStatsNote()}`,
  };
};
PIECES["stupa-niche-buddha"] = () => withBuddha(4.5, "tower");
PIECES["stupa-niche-faces-buddha"] = () => withBuddha(5.2, "faces");

PIECES["stupas-all"] = () => {
  const g = new Group();
  const all: [StupaLook, StupaForm][] = [
    ["white", "tower"],
    ["gold", "tower"],
    ["stone", "tower"],
    ["white", "faces"],
    ["gold", "faces"],
    ["stone", "faces"],
  ];
  all.forEach(([look, form], i) => {
    const s = stupa({ height: 4, look, form, sync: true });
    s.position.set((i - 2.5) * 2.3, 0, 0);
    g.add(s);
  });
  return { object: g, size: [11, 4], note: stupaStatsNote() };
};
